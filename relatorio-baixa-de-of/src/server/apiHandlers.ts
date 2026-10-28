import { getSupabase } from './supabase.js'
import type { ReportItem } from '../types/report.js'

const PDF_PATH_PREFIX = 'relatorios'
const PDF_BUCKET = 'relatorios-pdfs'
const PDF_MAX_SIZE = 50 * 1024 * 1024

interface ApiRequest {
  method?: string
  url?: string
  body?: unknown
}

interface ApiResponse {
  status: (statusCode: number) => ApiResponse
  json: (body: unknown) => void
}

type ApiHandler = (request: ApiRequest, response: ApiResponse) => Promise<void>

interface ReportRecord {
  of_number: string
  client: string
  workshop: string
  product: string
  deposit: string
  items: ReportItem[]
}

interface HttpError extends Error {
  statusCode?: number
}

function httpError(message: string, statusCode: number): HttpError {
  return Object.assign(new Error(message), { statusCode })
}

function sendJson(response: ApiResponse, status: number, body: unknown) {
  response.status(status).json(body)
}

function textValue(
  value: unknown,
  fieldName: string,
  { required = false, maxLength = 500 }: { required?: boolean; maxLength?: number } = {},
) {
  if (value == null && !required) return ''
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > maxLength) {
    throw httpError(
      required
        ? `O campo ${fieldName} é obrigatório e deve ter no máximo ${maxLength} caracteres.`
        : `O campo ${fieldName} deve ter no máximo ${maxLength} caracteres.`,
      400,
    )
  }
  return value.trim()
}

function normalizeReport(body: unknown): ReportRecord {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError('O corpo da requisição precisa ser um objeto JSON.', 400)
  }
  const data = body as Record<string, unknown>
  if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > 5000) {
    throw httpError('O relatório precisa conter de 1 a 5000 itens.', 400)
  }

  const items = data.items.map((item): ReportItem => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw httpError('Há um item inválido no relatório.', 400)
    }
    const values = item as Record<string, unknown>
    return {
      code: textValue(values.code, 'código do item'),
      description: textValue(values.description, 'descrição do item'),
      quantity: textValue(values.quantity, 'quantidade do item'),
      unit: textValue(values.unit, 'unidade do item'),
      deposit: textValue(values.deposit, 'depósito do item'),
      depositDescription: textValue(values.depositDescription, 'descrição do depósito'),
      cost: textValue(values.cost, 'custo do item'),
      total: textValue(values.total, 'total do item'),
    }
  })

  return {
    of_number: textValue(data.ofNumber, 'Número OF', { required: true, maxLength: 200 }),
    client: textValue(data.client, 'cliente', { maxLength: 200 }),
    workshop: textValue(data.workshop, 'oficina', { maxLength: 200 }),
    product: textValue(data.product, 'produto'),
    deposit: textValue(data.deposit, 'depósito'),
    items,
  }
}

function errorStatus(error: unknown) {
  return typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number(error.statusCode)
    : error instanceof SyntaxError ? 400 : 500
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}

export async function handleApiRequest(request: Request, handler: ApiHandler) {
  let body: unknown
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const requestBody = await request.text()
    if (requestBody) {
      try {
        body = JSON.parse(requestBody)
      } catch {
        return Response.json({ error: 'O corpo da requisição precisa ser um JSON válido.' }, { status: 400 })
      }
    }
  }

  let statusCode = 200
  let responseBody: unknown
  const response: ApiResponse = {
    status(code) {
      statusCode = code
      return response
    },
    json(value) {
      responseBody = value
    },
  }

  try {
    await handler({ method: request.method, url: request.url, body }, response)
  } catch (error) {
    console.error('Falha ao executar a função de API:', error)
    return Response.json(
      { error: 'Ocorreu um erro interno ao processar a solicitação.' },
      { status: 500 },
    )
  }

  return Response.json(responseBody, { status: statusCode })
}

function getPrintIdentification(request: ApiRequest, action: 'upload-url' | 'complete') {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname
  const match = pathname.match(new RegExp(`^/api/prints/(\\d+)/${action}/?$`))
  return match ? Number(match[1]) : Number.NaN
}

export async function health(_request: ApiRequest, response: ApiResponse) {
  let databaseConfigured = false
  try {
    getSupabase()
    databaseConfigured = true
  } catch (error) {
    if (errorStatus(error) !== 503) throw error
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
  const storageConfigured = Boolean(supabaseUrl && supabasePublishableKey)
  sendJson(response, 200, {
    status: 'ok',
    databaseConfigured,
    storageConfigured,
    ...(storageConfigured ? { supabaseUrl, supabasePublishableKey } : {}),
  })
}

export async function registerPrint(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Método não permitido.' })
    return
  }

  let identification: number | undefined
  try {
    const report = normalizeReport(request.body)
    const { data, error } = await getSupabase().rpc('register_print', { p_report: report })
    if (error) {
      console.error('Falha no RPC register_print do Supabase:', error)
      throw httpError('O Supabase não conseguiu salvar o relatório. Confira a configuração SQL e as credenciais.', 502)
    }

    identification = Number(data)
    if (!Number.isSafeInteger(identification) || identification < 1) {
      throw httpError('O Supabase retornou uma identificação inválida.', 502)
    }
    sendJson(response, 201, { identification, path: `${PDF_PATH_PREFIX}/${identification}.pdf` })
  } catch (error) {
    const status = errorStatus(error)
    if (status >= 500 && status !== 503) console.error('Falha ao registrar impressão:', error)
    sendJson(response, status, {
      error: errorMessage(error),
      ...(identification ? { identification } : {}),
    })
  }
}

export async function createPdfUpload(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Método não permitido.' })
    return
  }

  try {
    const identification = getPrintIdentification(request, 'upload-url')
    if (!Number.isSafeInteger(identification) || identification < 1) {
      sendJson(response, 400, { error: 'Identificação inválida.' })
      return
    }
    const supabase = getSupabase()
    const { data: authorized, error: authorizationError } = await supabase.rpc('authorize_print_pdf_upload', {
      p_identification: identification,
    })
    if (authorizationError) {
      console.error('Falha ao autorizar o upload no Supabase:', authorizationError)
      throw httpError('Não foi possível autorizar o envio do PDF.', 502)
    }
    if (authorized !== true) {
      throw httpError('A impressão não existe ou o PDF já foi arquivado.', 404)
    }

    const path = `${PDF_PATH_PREFIX}/${identification}.pdf`
    const { data, error } = await supabase.storage
      .from(PDF_BUCKET)
      .createSignedUploadUrl(path, { upsert: false })
    if (error) {
      console.error('Falha ao gerar URL de upload no Supabase Storage:', error)
      throw httpError('Não foi possível preparar o envio do PDF no Supabase Storage.', 502)
    }
    sendJson(response, 200, { path, token: data.token })
  } catch (error) {
    const status = errorStatus(error)
    if (status >= 500 && status !== 503) console.error('Falha ao preparar upload no Supabase Storage:', error)
    sendJson(response, status, { error: errorMessage(error) })
  }
}

export async function completePrint(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Método não permitido.' })
    return
  }

  const identification = getPrintIdentification(request, 'complete')
  if (!Number.isSafeInteger(identification) || identification < 1) {
    sendJson(response, 400, { error: 'Identificação inválida.' })
    return
  }

  try {
    const body = request.body && typeof request.body === 'object'
      ? request.body as Record<string, unknown>
      : {}
    const path = body.pathname
    const expectedPath = `${PDF_PATH_PREFIX}/${identification}.pdf`
    if (path !== expectedPath) {
      sendJson(response, 400, { error: 'O caminho do PDF não corresponde à identificação.' })
      return
    }

    const supabase = getSupabase()
    const { data: file, error: infoError } = await supabase.storage.from(PDF_BUCKET).info(expectedPath)
    if (infoError) {
      console.error('Falha ao verificar o PDF no Supabase Storage:', infoError)
      throw httpError('Não foi possível verificar o PDF enviado no Supabase Storage.', 502)
    }

    const fileSize = file?.size ?? file?.metadata?.size
    const contentType = file?.contentType ?? file?.metadata?.mimetype
    if (contentType !== 'application/pdf'
      || typeof fileSize !== 'number'
      || !Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > PDF_MAX_SIZE) {
      sendJson(response, 400, { error: 'O arquivo enviado não é um PDF válido para esta identificação.' })
      return
    }

    const { error } = await supabase.rpc('complete_print', {
      p_identification: identification,
      p_pdf_path: expectedPath,
    })
    if (error) {
      console.error('Falha no RPC complete_print do Supabase:', error)
      throw httpError('O PDF foi enviado, mas o banco não conseguiu confirmar o arquivamento.', 502)
    }
    sendJson(response, 200, { identification, archived: true })
  } catch (error) {
    const status = errorStatus(error)
    if (status >= 500 && status !== 503) console.error('Falha ao finalizar arquivamento do PDF:', error)
    sendJson(response, status, { error: errorMessage(error), identification })
  }
}
