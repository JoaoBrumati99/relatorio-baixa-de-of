import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ReportPayload } from '../types/report'

interface ApiError {
  error?: string
  identification?: number
}

interface HealthResponse {
  databaseConfigured: boolean
  storageConfigured: boolean
  supabaseUrl?: string
  supabasePublishableKey?: string
}

interface RegisterResponse {
  identification: number
}

interface UploadUrlResponse {
  path: string
  token: string
}

export class ArchiveError extends Error {
  identification?: number

  constructor(message: string, identification?: number) {
    super(message)
    this.name = 'ArchiveError'
    this.identification = identification
  }
}

class ApiResponseError extends Error {
  identification?: number

  constructor(message: string, identification?: number) {
    super(message)
    this.name = 'ApiResponseError'
    this.identification = identification
  }
}

let storageClient: SupabaseClient | null = null

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const responseText = await response.text()
  let body: T & ApiError

  try {
    body = JSON.parse(responseText) as T & ApiError
  } catch {
    const requestId = response.headers.get('x-vercel-id')
    throw new Error(
      `A API respondeu com HTTP ${response.status}, mas não retornou JSON.${requestId ? ` ID: ${requestId}.` : ''}`,
    )
  }

  if (!response.ok) {
    throw new ApiResponseError(
      body.error || 'Não foi possível concluir a solicitação.',
      body.identification,
    )
  }
  return body
}

export async function initializeReportApi() {
  const health = await requestJson<HealthResponse>('/api/health')
  if (!health.databaseConfigured) {
    throw new Error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente do servidor.')
  }
  if (!health.storageConfigured || !health.supabaseUrl || !health.supabasePublishableKey) {
    throw new Error('Configure SUPABASE_PUBLISHABLE_KEY e crie o bucket privado no Supabase Storage.')
  }

  storageClient = createClient(health.supabaseUrl, health.supabasePublishableKey)
}

export async function archiveReport(
  report: ReportPayload,
  createPdf: (identification: number) => Promise<Blob>,
  onIdentification: (identification: number) => void,
) {
  let identification: number | undefined

  try {
    const registered = await requestJson<RegisterResponse>('/api/prints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ofNumber: report.metadata.ofNumber,
        workshop: report.metadata.workshop,
        client: report.metadata.client,
        product: report.metadata.product,
        deposit: report.deposit,
        items: report.items,
      }),
    })
    identification = registered.identification
    if (!Number.isSafeInteger(identification) || identification < 1) {
      throw new Error('O servidor retornou uma identificação inválida.')
    }

    onIdentification(identification)
    const uploadUrl = await requestJson<UploadUrlResponse>(
      `/api/prints/${identification}/upload-url`,
      { method: 'POST' },
    )
    const pdf = await createPdf(identification)
    if (!storageClient) throw new Error('O armazenamento do relatório não foi inicializado.')

    const { error: uploadError } = await storageClient
      .storage.from('relatorios-pdfs')
      .uploadToSignedUrl(uploadUrl.path, uploadUrl.token, pdf, {
        contentType: 'application/pdf',
        upsert: false,
      })
    if (uploadError) throw new Error(uploadError.message)

    await requestJson(`/api/prints/${identification}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pathname: uploadUrl.path }),
    })

    return { identification }
  } catch (error) {
    throw new ArchiveError(
      getErrorMessage(error),
      identification ?? (error instanceof ApiResponseError ? error.identification : undefined),
    )
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}
