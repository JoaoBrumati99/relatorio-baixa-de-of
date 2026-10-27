import { useEffect, useState } from 'react'
import { ArchiveError, archiveReport, initializeReportApi } from './api/reportApi'
import { Header } from './components/Header/Header'
import { ReportDocument } from './components/ReportDocument/ReportDocument'
import { ReportToolbar } from './components/ReportToolbar/ReportToolbar'
import { StatusMessage } from './components/StatusMessage/StatusMessage'
import { createPdfFile, positionSignaturesAtPageFooter } from './services/pdfService'
import { readSpreadsheet } from './services/spreadsheetService'
import type { ReportItem, ReportMetadata } from './types/report'
import './App.css'

const initialMetadata: ReportMetadata = {
  ofNumber: '',
  workshop: '',
  client: '',
  product: '',
}

const initialStatus = 'Selecione uma planilha para montar o relatório.'

function getDepositDescription(items: ReportItem[]) {
  const deposits = [...new Set(items.map((item) => item.deposit))].sort()
  const descriptions = [...new Set(items.map((item) => item.depositDescription).filter(Boolean))].sort()

  return deposits.length === 1 && descriptions.length
    ? `${deposits[0]} - ${descriptions[0].split(' MG (')[0]}`
    : deposits.join(' / ')
}

function App() {
  const [items, setItems] = useState<ReportItem[]>([])
  const [operatorName, setOperatorName] = useState('')
  const [metadata, setMetadata] = useState(initialMetadata)
  const [deposit, setDeposit] = useState('')
  const [fileName, setFileName] = useState('')
  const [identification, setIdentification] = useState<number | null>(null)
  const [status, setStatus] = useState(initialStatus)
  const [statusIsError, setStatusIsError] = useState(false)
  const [apiError, setApiError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [apiReady, setApiReady] = useState(false)
  const [printTimestamp, setPrintTimestamp] = useState(() => new Date())

  useEffect(() => {
    let active = true

    initializeReportApi()
      .then(() => {
        if (!active) return
        setApiReady(true)
        setApiError('')
        setStatus((current) => current === initialStatus
          ? 'Supabase e armazenamento configurados. Selecione uma planilha para montar o relatório.'
          : current)
      })
      .catch((error: unknown) => {
        if (!active) return
        setApiError(`Armazenamento: ${getErrorMessage(error)}`)
      })

    return () => {
      active = false
    }
  }, [])

  function updateMetadata(field: keyof ReportMetadata, value: string) {
    setMetadata((current) => ({ ...current, [field]: value }))
  }

  async function handleFileChange(file: File | undefined) {
    if (!file) return

    setFileName(file.name)
    setItems([])
    setOperatorName('')
    setDeposit('')
    setIdentification(null)
    setStatus('Lendo arquivo...')
    setStatusIsError(false)
    setIsLoading(true)

    try {
      const parsed = await readSpreadsheet(file)
      setItems(parsed.items)
      setOperatorName(parsed.operatorName ?? '')
      setDeposit(parsed.deposit)
      setMetadata((current) => ({
        ...current,
        ...(parsed.ofNumber !== undefined ? { ofNumber: parsed.ofNumber } : {}),
        ...(parsed.product !== undefined ? { product: parsed.product } : {}),
      }))
      setStatus(parsed.items.length
        ? `${parsed.items.length} linha(s) incluída(s) no relatório.`
        : 'A planilha não contém itens para exibir.')
      setStatusIsError(parsed.items.length === 0)
    } catch (error) {
      setStatus(getErrorMessage(error))
      setStatusIsError(true)
    } finally {
      setIsLoading(false)
    }
  }

  function removeItem(index: number) {
    const updatedItems = items.filter((_, itemIndex) => itemIndex !== index)
    setItems(updatedItems)
    setDeposit(getDepositDescription(updatedItems))
    setStatus(updatedItems.length
      ? `Item removido. ${updatedItems.length} linha(s) restante(s) no relatório.`
      : 'Todos os itens foram removidos do relatório.')
    setStatusIsError(false)
  }

  async function handleSave() {
    setIsSaving(true)
    setPrintTimestamp(new Date())
    setStatus('Registrando a impressão no banco de dados...')
    setStatusIsError(false)

    let savedIdentification: number | undefined
    let isArchived = false
    try {
      const report = {
        metadata: {
          ofNumber: metadata.ofNumber.trim(),
          workshop: metadata.workshop.trim(),
          client: metadata.client.trim(),
          product: metadata.product.trim(),
        },
        deposit,
        items,
      }
      const { identification: newIdentification } = await archiveReport(
        report,
        async (identification) => {
          setStatus(`Gerando PDF da identificação ${String(identification).padStart(2, '0')}...`)
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
          const paper = document.getElementById('paper')
          if (!paper) throw new Error('Não foi possível localizar o relatório para gerar o PDF.')
          return createPdfFile(paper)
        },
        (newIdentification) => {
          savedIdentification = newIdentification
          setIdentification(newIdentification)
        },
      )
      savedIdentification = newIdentification
      isArchived = true
      setStatus(`PDF arquivado no Supabase Storage. Identificação ${String(newIdentification).padStart(2, '0')}. Abrindo a impressão...`)
      const paper = document.getElementById('paper')
      if (!paper) throw new Error('Não foi possível localizar o relatório para imprimir.')
      document.body.classList.add('pdf-export')
      positionSignaturesAtPageFooter(paper)
      window.addEventListener('beforeprint', () => positionSignaturesAtPageFooter(paper), { once: true })
      window.addEventListener('afterprint', () => {
        const spacer = paper.querySelector<HTMLElement>('.signature-spacer')
        if (spacer) spacer.style.height = ''
        document.body.classList.remove('pdf-export')
      }, { once: true })
      document.title = `Baixa_Consumo_OF_${metadata.ofNumber.trim().replace(/[\\/:*?"<>|]/g, '_')}`
      window.print()
      window.setTimeout(() => {
        document.title = 'Baixa de Consumo de Aviamentos'
      }, 1000)
    } catch (error) {
      const identification = error instanceof ArchiveError
        ? error.identification
        : savedIdentification
      const prefix = isArchived && identification
        ? `PDF arquivado com identificação ${String(identification).padStart(2, '0')}, mas não foi possível abrir a impressão.`
        : identification
          ? `Identificação ${String(identification).padStart(2, '0')} registrada; o PDF pode não ter sido arquivado.`
          : 'Erro ao registrar a impressão.'
      setStatus(`${prefix} ${getErrorMessage(error)}`)
      setStatusIsError(true)
    } finally {
      setIsSaving(false)
    }
  }

  const canSave = apiReady
    && items.length > 0
    && Boolean(metadata.ofNumber.trim())
    && Boolean(metadata.product.trim())
    && !isLoading
    && !isSaving

  return (
    <div className="app">
      <Header
        fileName={fileName}
        isDisabled={isSaving || isLoading}
        onFileChange={handleFileChange}
      />
      <ReportToolbar
        metadata={metadata}
        isDisabled={isSaving || isLoading}
        canSave={canSave}
        onChange={updateMetadata}
        onSave={handleSave}
      />
      <StatusMessage
        message={!apiReady && apiError ? `${status} ${apiError}` : status}
        isError={statusIsError || Boolean(apiError)}
      />
      <main className="workspace">
        <ReportDocument
          identification={identification}
          items={items}
          metadata={metadata}
          operatorName={operatorName}
          timestamp={printTimestamp}
          onRemoveItem={removeItem}
          isSaving={isSaving}
        />
      </main>
    </div>
  )
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}

export default App
