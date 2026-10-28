const { getSupabase } = require('./supabase');

const PDF_PATH_PREFIX = 'relatorios';
const PDF_BUCKET = 'relatorios-pdfs';
const PDF_MAX_SIZE = 50 * 1024 * 1024;

function sendJson(response, status, body) {
  if (typeof response.status === 'function') {
    response.status(status).json(body);
    return;
  }
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function textValue(value, fieldName, { required = false, maxLength = 500 } = {}) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > maxLength) {
    throw Object.assign(new Error(
      required
        ? `O campo ${fieldName} é obrigatório e deve ter no máximo ${maxLength} caracteres.`
        : `O campo ${fieldName} deve ter no máximo ${maxLength} caracteres.`,
    ), { statusCode: 400 });
  }
  return value.trim();
}

function normalizeReport(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('O corpo da requisição precisa ser um objeto JSON.'), { statusCode: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 5000) {
    throw Object.assign(new Error('O relatório precisa conter de 1 a 5000 itens.'), { statusCode: 400 });
  }

  return {
    of_number: textValue(body.ofNumber, 'Número OF', { required: true, maxLength: 200 }),
    client: textValue(body.client, 'cliente', { maxLength: 200 }),
    workshop: textValue(body.workshop, 'oficina', { maxLength: 200 }),
    product: textValue(body.product, 'produto'),
    deposit: textValue(body.deposit, 'depósito'),
    items: body.items.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw Object.assign(new Error('Há um item inválido no relatório.'), { statusCode: 400 });
      }
      return {
        code: textValue(item.code, 'código do item'),
        description: textValue(item.description, 'descrição do item'),
        quantity: textValue(item.quantity, 'quantidade do item'),
        unit: textValue(item.unit, 'unidade do item'),
        deposit: textValue(item.deposit, 'depósito do item'),
        depositDescription: textValue(item.depositDescription, 'descrição do depósito'),
        cost: textValue(item.cost, 'custo do item'),
        total: textValue(item.total, 'total do item'),
      };
    }),
  };
}

function createApiHandlers(options = {}) {
  const resolveSupabase = () => options.supabase || getSupabase();
  const getSupabasePublicConfig = () => {
    if (options.supabasePublicConfig) return options.supabasePublicConfig;
    const url = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    return url && publishableKey ? { url, publishableKey } : null;
  };

  async function health(_request, response) {
    try {
      resolveSupabase();
      const publicConfig = getSupabasePublicConfig();
      sendJson(response, 200, {
        status: 'ok',
        databaseConfigured: true,
        storageConfigured: publicConfig !== null,
        ...(publicConfig ? {
          supabaseUrl: publicConfig.url,
          supabasePublishableKey: publicConfig.publishableKey,
        } : {}),
      });
    } catch {
      sendJson(response, 200, { status: 'ok', databaseConfigured: false, storageConfigured: false });
    }
  }

  async function registerPrint(request, response) {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Método não permitido.' });
      return;
    }

    let identification;
    try {
      const report = normalizeReport(request.body);
      const supabase = resolveSupabase();
      const { data, error } = await supabase.rpc('register_print', { p_report: report });
      if (error) {
        console.error('Falha no RPC register_print do Supabase:', error);
        throw Object.assign(new Error('O Supabase não conseguiu salvar o relatório. Confira a configuração SQL e as credenciais.'), {
          statusCode: 502,
        });
      }

      identification = Number(data);
      if (!Number.isSafeInteger(identification) || identification < 1) {
        throw Object.assign(new Error('O Supabase retornou uma identificação inválida.'), { statusCode: 502 });
      }

      sendJson(response, 201, { identification, path: `${PDF_PATH_PREFIX}/${identification}.pdf` });
    } catch (error) {
      const status = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
      if (status >= 500 && status !== 503) console.error('Falha ao registrar impressão:', error);
      sendJson(response, status, {
        error: error.message,
        ...(identification ? { identification } : {}),
      });
    }
  }

  async function createPdfUpload(request, response) {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Método não permitido.' });
      return;
    }

    try {
      const identification = Number(request.query?.id);
      if (!Number.isSafeInteger(identification) || identification < 1) {
        sendJson(response, 400, { error: 'Identificação inválida.' });
        return;
      }

      const supabase = resolveSupabase();
      const { data: authorized, error: authorizationError } = await supabase.rpc('authorize_print_pdf_upload', {
        p_identification: identification,
      });
      if (authorizationError) {
        console.error('Falha ao autorizar o upload no Supabase:', authorizationError);
        throw Object.assign(new Error('Não foi possível autorizar o envio do PDF.'), { statusCode: 502 });
      }
      if (authorized !== true) {
        throw Object.assign(new Error('A impressão não existe ou o PDF já foi arquivado.'), { statusCode: 404 });
      }

      const path = `${PDF_PATH_PREFIX}/${identification}.pdf`;
      const { data, error } = await supabase.storage
        .from(PDF_BUCKET)
        .createSignedUploadUrl(path, { upsert: false });
      if (error) {
        console.error('Falha ao gerar URL de upload no Supabase Storage:', error);
        throw Object.assign(new Error('Não foi possível preparar o envio do PDF no Supabase Storage.'), {
          statusCode: 502,
        });
      }
      sendJson(response, 200, { path, token: data.token });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500 && status !== 503) console.error('Falha ao preparar upload no Supabase Storage:', error);
      sendJson(response, status, { error: error.message });
    }
  }

  async function completePrint(request, response) {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Método não permitido.' });
      return;
    }
    const identification = Number(request.query?.id);
    if (!Number.isSafeInteger(identification) || identification < 1) {
      sendJson(response, 400, { error: 'Identificação inválida.' });
      return;
    }

    try {
      const path = request.body?.pathname;
      const expectedPath = `${PDF_PATH_PREFIX}/${identification}.pdf`;
      if (path !== expectedPath) {
        sendJson(response, 400, { error: 'O caminho do PDF não corresponde à identificação.' });
        return;
      }

      const supabase = resolveSupabase();
      const { data: file, error: infoError } = await supabase.storage.from(PDF_BUCKET).info(path);
      if (infoError) {
        console.error('Falha ao verificar o PDF no Supabase Storage:', infoError);
        throw Object.assign(new Error('Não foi possível verificar o PDF enviado no Supabase Storage.'), {
          statusCode: 502,
        });
      }
      const fileSize = file?.size ?? file?.metadata?.size;
      const contentType = file?.contentType ?? file?.metadata?.mimetype;
      if (contentType !== 'application/pdf'
        || !Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > PDF_MAX_SIZE) {
        sendJson(response, 400, { error: 'O arquivo enviado não é um PDF válido para esta identificação.' });
        return;
      }

      const { error } = await supabase.rpc('complete_print', {
        p_identification: identification,
        p_pdf_path: path,
      });
      if (error) {
        console.error('Falha no RPC complete_print do Supabase:', error);
        throw Object.assign(new Error('O PDF foi enviado, mas o banco não conseguiu confirmar o arquivamento.'), {
          statusCode: 502,
        });
      }
      sendJson(response, 200, { identification, archived: true });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500 && status !== 503) console.error('Falha ao finalizar arquivamento do PDF:', error);
      sendJson(response, status, { error: error.message, identification });
    }
  }

  return { health, registerPrint, createPdfUpload, completePrint };
}

module.exports = { createApiHandlers };
