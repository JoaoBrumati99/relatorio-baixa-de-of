const PDF_VIEWPORT_WIDTH = 794

export async function createPdfFile(paper: HTMLElement): Promise<Blob> {
  const { default: html2pdf } = await import('html2pdf.js')
  document.body.classList.add('pdf-export')

  try {
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
          },
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(paper)
      .outputPdf('blob')
  } finally {
    document.body.classList.remove('pdf-export')
  }
}
