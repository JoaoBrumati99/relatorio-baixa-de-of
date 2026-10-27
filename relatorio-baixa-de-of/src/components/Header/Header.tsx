import './Header.css'

interface HeaderProps {
  fileName: string
  isDisabled: boolean
  onFileChange: (file: File | undefined) => void
}

export function Header({ fileName, isDisabled, onFileChange }: HeaderProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <img src="/logo_amalfis.jpg" alt="" />
        <span>Baixa de Consumo</span>
      </div>
      <div className="top-actions">
        <span className="file-name" title={fileName || undefined}>
          {fileName || 'Nenhuma planilha selecionada'}
        </span>
        <label className="file-button">
          <input
            type="file"
            accept=".xlsx,.xlsm,.csv"
            disabled={isDisabled}
            onChange={(event) => {
              onFileChange(event.currentTarget.files?.[0])
              event.currentTarget.value = ''
            }}
          />
          <span>Selecionar Excel ou CSV</span>
        </label>
      </div>
    </header>
  )
}
