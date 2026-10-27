const PDF_VIEWPORT_WIDTH = 794
const A4_PAGE_HEIGHT_MM = 297
const A4_PAGE_WIDTH_MM = 210
const PDF_PAGE_ROUNDING_GUARD = 12

export function positionSignaturesAtPageFooter(paper: HTMLElement) {
  const table = paper.querySelector<HTMLElement>('.doc-table')
  const signatures = paper.querySelector<HTMLElement>('.signatures')
  const spacer = paper.querySelector<HTMLElement>('.signature-spacer')
  if (!table || !signatures || !spacer) {
    throw new Error('Não foi possível localizar a tabela e as assinaturas do relatório.')
  }

  spacer.style.height = '0px'
  const paperRect = paper.getBoundingClientRect()
  const tableTop = table.getBoundingClientRect().top - paperRect.top
  const tableBottom = table.getBoundingClientRect().bottom - paperRect.top
  const pageHeight = paperRect.width * A4_PAGE_HEIGHT_MM / A4_PAGE_WIDTH_MM
  const firstTablePage = Math.floor(tableTop / pageHeight)
  const lastTablePage = Math.max(firstTablePage, Math.ceil(tableBottom / pageHeight) - 1)
  const repeatedHeaderHeight = table.querySelector('thead')?.getBoundingClientRect().height ?? 0
  const repeatedHeaderSpace = (lastTablePage - firstTablePage) * repeatedHeaderHeight
  const effectiveTableBottom = tableBottom + repeatedHeaderSpace
  const bottomPadding = Number.parseFloat(getComputedStyle(paper).paddingBottom) || 0
  const signaturesHeight = signatures.getBoundingClientRect().height
  const pageIndex = Math.floor((effectiveTableBottom + signaturesHeight + bottomPadding) / pageHeight)
  const signatureTop = (pageIndex + 1) * pageHeight - bottomPadding - signaturesHeight - PDF_PAGE_ROUNDING_GUARD

  spacer.style.height = `${Math.max(0, signatureTop - effectiveTableBottom)}px`
}

export async function createPdfFile(paper: HTMLElement): Promise<Blob> {
  const { default: html2pdf } = await import('html2pdf.js')
  document.body.classList.add('pdf-export')

  try {
    positionSignaturesAtPageFooter(paper)
    return await html2pdf()
      .set({
        margin: 0,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
          scale: 1.5,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: PDF_VIEWPORT_WIDTH,
          width: PDF_VIEWPORT_WIDTH,
          scrollX: 0,
          scrollY: 0,
          onclone: (clonedDocument: Document) => {
            clonedDocument.body.classList.add('pdf-export')
            const clonedPaper = clonedDocument.getElementById('paper')
            if (!clonedPaper) throw new Error('O relatório não foi encontrado durante a exportação.')
            clonedPaper.style.width = `${PDF_VIEWPORT_WIDTH}px`
            clonedPaper.style.minWidth = `${PDF_VIEWPORT_WIDTH}px`
            clonedPaper.style.maxWidth = `${PDF_VIEWPORT_WIDTH}px`
            clonedPaper.style.margin = '0'
            clonedPaper.style.boxSizing = 'border-box'
            positionSignaturesAtPageFooter(clonedPaper)
          },
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(paper)
      .outputPdf('blob')
  } finally {
    document.body.classList.remove('pdf-export')
    const spacer = paper.querySelector<HTMLElement>('.signature-spacer')
    if (spacer) spacer.style.height = ''
  }
}
