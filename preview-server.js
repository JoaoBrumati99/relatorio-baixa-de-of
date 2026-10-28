const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createApiHandlers } = require('./lib/api-handlers');

const ROOT = __dirname;
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/lib/report-items.js', ['lib/report-items.js', 'text/javascript; charset=utf-8']],
  ['/logo_amalfis.jpg', ['logo_amalfis.jpg', 'image/jpeg']],
]);

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function createServer(options = {}) {
  const handlers = createApiHandlers(options);
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
      await handlers.health(request, response);
      return;
    }
    if (requestUrl.pathname === '/api/prints') {
      try {
        request.body = await readJson(request);
        await handlers.registerPrint(request, response);
      } catch {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'O corpo da requisição não é um JSON válido.' }));
      }
      return;
    }
    const completeMatch = requestUrl.pathname.match(/^\/api\/prints\/(\d+)\/complete$/);
    if (completeMatch) {
      try {
        request.query = { id: completeMatch[1] };
        request.body = await readJson(request);
        await handlers.completePrint(request, response);
      } catch {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'O corpo da requisição não é um JSON válido.' }));
      }
      return;
    }
    const uploadMatch = requestUrl.pathname.match(/^\/api\/prints\/(\d+)\/upload-url$/);
    if (uploadMatch) {
      request.query = { id: uploadMatch[1] };
      await handlers.createPdfUpload(request, response);
      return;
    }

    if (request.method === 'GET' && STATIC_FILES.has(requestUrl.pathname)) {
      const [fileName, contentType] = STATIC_FILES.get(requestUrl.pathname);
      try {
        const content = await fs.promises.readFile(path.join(ROOT, fileName));
        response.writeHead(200, { 'Content-Type': contentType });
        response.end(content);
      } catch (error) {
        console.error(`Falha ao carregar ${fileName}:`, error);
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Não foi possível carregar os arquivos do sistema.');
      }
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Recurso não encontrado.' }));
  });

  return server;
}

if (require.main === module) {
  try {
    process.loadEnvFile(path.join(ROOT, '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('A variável PORT precisa ser um número entre 0 e 65535.');
    process.exitCode = 1;
  } else {
    const server = createServer();
    server.listen(port, '0.0.0.0', () => {
      const address = server.address();
      console.log(`Servidor disponível na rede local pela porta ${address.port}.`);
      console.log('Abra http://localhost:' + address.port + ' neste computador.');
      console.log('Os demais computadores devem usar o nome ou IP deste computador.');
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => server.close(() => process.exit(0)));
    }
  }
}

module.exports = { createServer };
