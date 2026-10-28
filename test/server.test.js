const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createServer } = require('../preview-server');
const { combineDuplicateItems } = require('../lib/report-items');

const sampleReport = {
  ofNumber: '033787',
  client: 'Movida',
  workshop: 'Reginaldo',
  product: '01.451.004',
  deposit: '0004 - DEP. COMPRA',
  items: [{
    code: '05009019',
    description: 'ZIPER METAL',
    deposit: '0004',
    depositDescription: 'DEP. COMPRA',
    unit: 'UN',
    quantity: '113',
    cost: '12,50',
    total: '1.412,50',
  }],
};

function createSupabaseMock(fileMetadata = { size: 1024, contentType: 'application/pdf' }) {
  let identification = 0;
  const reports = [];
  const completed = [];
  const uploadAuthorizations = [];
  const signedUploads = [];
  const supabase = {
    async rpc(name, params) {
      if (name === 'register_print') {
        reports.push(params.p_report);
        identification += 1;
        return { data: identification, error: null };
      }
      if (name === 'authorize_print_pdf_upload') {
        uploadAuthorizations.push(params.p_identification);
        return { data: params.p_identification <= identification, error: null };
      }
      if (name === 'complete_print') {
        completed.push({ identification: params.p_identification, path: params.p_pdf_path });
        return { data: null, error: null };
      }
      return { data: null, error: new Error('Unknown RPC') };
    },
    storage: {
      from(bucket) {
        return {
          async createSignedUploadUrl(path, options) {
            signedUploads.push({ bucket, path, options });
            return { data: { path, token: `signed:${path}`, signedUrl: `https://supabase.example/${path}` }, error: null };
          },
          async info(path) {
            return {
              data: { name: path.split('/').pop(), ...fileMetadata },
              error: null,
            };
          },
        };
      },
    },
  };
  return { supabase, reports, completed, uploadAuthorizations, signedUploads };
}

function start(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => {
    if (error) reject(error);
    else resolve();
  }));
}

async function requestJson(port, pathname, body, method = 'POST') {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, body
    ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method });
  return { status: response.status, body: await response.json() };
}

test('health reports Supabase readiness and exposes only the publishable configuration', async (t) => {
  const mock = createSupabaseMock();
  const server = createServer({
    supabase: mock.supabase,
    supabasePublicConfig: { url: 'https://supabase.example', publishableKey: 'public-key' },
  });
  await start(server);
  t.after(() => close(server));

  const port = server.address().port;
  const health = await requestJson(port, '/api/health', null, 'GET');
  assert.deepEqual(health.body, {
    status: 'ok',
    databaseConfigured: true,
    storageConfigured: true,
    supabaseUrl: 'https://supabase.example',
    supabasePublishableKey: 'public-key',
  });

  const page = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(page.status, 200);
  const pageText = await page.text();
  assert.match(pageText, /Identificação: --/);
  assert.match(pageText, /@supabase\/supabase-js@2/);
  assert.doesNotMatch(pageText, /@vercel\/blob/i);
  assert.match(pageText, /Descrição de material/);
  assert.match(pageText, /<th>Quant\.<\/th>/);
  assert.doesNotMatch(pageText, /<th>Lote<\/th>/);
  assert.match(pageText, /<th>Depósito<\/th>/);
  assert.doesNotMatch(pageText, /id="print-deposit"/);
  assert.doesNotMatch(pageText, /ALLOWED_DEPOSITS/);
  assert.match(pageText, /Nenhum item encontrado na planilha/);
  assert.match(pageText, /Assinatura Externo/);

  const helper = await fetch(`http://127.0.0.1:${port}/lib/report-items.js`);
  assert.equal(helper.status, 200);
  const styles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(styles, /\.doc-table th:first-child, \.doc-table td:first-child \{[\s\S]*white-space: nowrap;/);
  assert.match(styles, /\.doc-table col:nth-child\(1\) \{ width: 13%; \}/);
  assert.match(styles, /\.pdf-export \.doc-table col:nth-child\(1\) \{ width: 14%; \}/);
  assert.match(styles, /\.doc-table th:nth-child\(n \+ 3\):nth-child\(-n \+ 7\)/);
});

test('duplicate item quantities and totals are combined by code and deposit', () => {
  const items = combineDuplicateItems([
    { code: '05012021', description: 'COLARINHO', quantity: '100', unit: 'UN', deposit: '0020', cost: '0,84', total: '84,00' },
    { code: '05012021', description: 'COLARINHO', quantity: '58', unit: 'UN', deposit: '0020', cost: '0,84', total: '48,72' },
    { code: '05012021', description: 'COLARINHO', quantity: '25', unit: 'UN', deposit: '0004', cost: '0,90', total: '22,50' },
    { code: '05012022', description: 'OUTRO ITEM', quantity: '5', unit: 'UN', deposit: '0020', cost: '1,00', total: '5,00' },
  ]);

  assert.deepEqual(items.map(({ code, deposit, quantity, cost, total }) => ({
    code, deposit, quantity, cost, total,
  })), [
    { code: '05012021', deposit: '0020', quantity: '158', cost: 'R$ 0,84', total: 'R$ 132,72' },
    { code: '05012021', deposit: '0004', quantity: '25', cost: 'R$ 0,90', total: 'R$ 22,50' },
    { code: '05012022', deposit: '0020', quantity: '5', cost: 'R$ 1,00', total: 'R$ 5,00' },
  ]);
});

test('print registrations receive global IDs and signed Supabase Storage uploads', async (t) => {
  const mock = createSupabaseMock();
  const server = createServer({ supabase: mock.supabase });
  await start(server);
  t.after(() => close(server));

  const port = server.address().port;
  const results = await Promise.all(Array.from({ length: 10 }, () =>
    requestJson(port, '/api/prints', sampleReport)));

  assert.ok(results.every((result) => result.status === 201));
  assert.deepEqual(results.map((result) => result.body.identification).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(results.every((result) => result.body.path === `relatorios/${result.body.identification}.pdf`));
  assert.equal(mock.reports.length, 10);
  assert.ok(mock.reports.every((report) => report.of_number === sampleReport.ofNumber));
  assert.ok(mock.reports.every((report) => report.items.length === 1));
  assert.deepEqual(mock.reports[0].items[0], {
    code: sampleReport.items[0].code,
    description: sampleReport.items[0].description,
    quantity: sampleReport.items[0].quantity,
    unit: sampleReport.items[0].unit,
    deposit: sampleReport.items[0].deposit,
    depositDescription: sampleReport.items[0].depositDescription,
    cost: sampleReport.items[0].cost,
    total: sampleReport.items[0].total,
  });

  const upload = await requestJson(port, '/api/prints/1/upload-url', {});
  assert.equal(upload.status, 200);
  assert.deepEqual(upload.body, { path: 'relatorios/1.pdf', token: 'signed:relatorios/1.pdf' });
  assert.deepEqual(mock.uploadAuthorizations, [1]);
  assert.deepEqual(mock.signedUploads, [{
    bucket: 'relatorios-pdfs',
    path: 'relatorios/1.pdf',
    options: { upsert: false },
  }]);

  const completed = await requestJson(port, '/api/prints/1/complete', { pathname: 'relatorios/1.pdf' });
  assert.deepEqual(completed.body, { identification: 1, archived: true });
  assert.deepEqual(mock.completed, [{ identification: 1, path: 'relatorios/1.pdf' }]);
});

test('invalid reports do not consume identifiers', async (t) => {
  const mock = createSupabaseMock();
  const server = createServer({ supabase: mock.supabase });
  await start(server);
  t.after(() => close(server));

  const port = server.address().port;
  const invalid = await requestJson(port, '/api/prints', { ...sampleReport, items: [] });
  const valid = await requestJson(port, '/api/prints', sampleReport);
  assert.equal(invalid.status, 400);
  assert.equal(valid.status, 201);
  assert.equal(valid.body.identification, 1);
});

test('Supabase upload URLs require a matching pending print', async (t) => {
  const mock = createSupabaseMock();
  const server = createServer({ supabase: mock.supabase });
  await start(server);
  t.after(() => close(server));

  const port = server.address().port;
  await requestJson(port, '/api/prints', sampleReport);
  const unknownPrint = await requestJson(port, '/api/prints/2/upload-url', {});

  assert.equal(unknownPrint.status, 404);
  assert.deepEqual(mock.uploadAuthorizations, [2]);
});

test('print completion rejects files above the Supabase bucket limit', async (t) => {
  const mock = createSupabaseMock({ size: 50 * 1024 * 1024 + 1, contentType: 'application/pdf' });
  const server = createServer({ supabase: mock.supabase });
  await start(server);
  t.after(() => close(server));

  const port = server.address().port;
  const result = await requestJson(port, '/api/prints/1/complete', { pathname: 'relatorios/1.pdf' });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /PDF válido/);
  assert.deepEqual(mock.completed, []);
});

test('missing Supabase configuration fails explicitly', async (t) => {
  const server = createServer();
  await start(server);
  t.after(() => close(server));

  const result = await requestJson(server.address().port, '/api/prints', sampleReport);
  assert.equal(result.status, 503);
  assert.match(result.body.error, /Supabase não está configurado/);
});

test('Supabase schema configures private PDF storage and protects RPCs', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  const storageMigration = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrate-pdf-storage-to-supabase.sql'),
    'utf8',
  );
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.register_print/);
  assert.match(migration, /INSERT INTO public\.print_sequence \(id, value\)\s+SELECT 1, COALESCE\(MAX\(identification\), 0\)\s+FROM public\.print_records\s+ON CONFLICT \(id\) DO NOTHING;\s+UPDATE public\.print_sequence/);
  assert.match(migration, /UPDATE public\.print_sequence\s+SET value = value \+ 1/);
  assert.match(migration, /INSERT INTO public\.print_records/);
  assert.match(migration, /pdf_path/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_print/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.authorize_print_pdf_upload/);
  assert.match(migration, /INSERT INTO storage\.buckets/);
  assert.match(migration, /'relatorios-pdfs', 'relatorios-pdfs', false, 52428800/);
  assert.match(migration, /ARRAY\['application\/pdf'\]/);
  assert.match(migration, /pdf_uploaded_at/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.register_print\(jsonb\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.register_print\(jsonb\) TO service_role/);
  assert.match(storageMigration, /INSERT INTO storage\.buckets/);
  assert.match(storageMigration, /'relatorios-pdfs', 'relatorios-pdfs', false, 52428800/);
  const sequenceMigration = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrate-repair-print-sequence.sql'),
    'utf8',
  );
  assert.match(sequenceMigration, /INSERT INTO public\.print_sequence \(id, value\)\s+SELECT 1, COALESCE\(MAX\(identification\), 0\)\s+FROM public\.print_records\s+ON CONFLICT \(id\) DO NOTHING;\s+UPDATE public\.print_sequence/);
  assert.match(sequenceMigration, /GRANT EXECUTE ON FUNCTION public\.register_print\(jsonb\) TO service_role/);
});
