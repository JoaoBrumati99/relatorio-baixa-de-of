import { Button } from '../Button/Button'
import './ReportToolbar.css'
import type { ReportMetadata } from '../../types/report'

interface ReportToolbarProps {
  metadata: ReportMetadata
  isDisabled: boolean
  canSave: boolean
  onChange: (field: keyof ReportMetadata, value: string) => void
  onSave: () => void
}

export function ReportToolbar({
  metadata,
  isDisabled,
  canSave,
  onChange,
  onSave,
}: ReportToolbarProps) {
  return (
    <section className="toolbar" aria-label="Dados do relatório">
      <label className="field">
        <span>Número OF</span>
        <input
          type="text"
          autoComplete="off"
          placeholder="Ex.: 031919"
          value={metadata.ofNumber}
          disabled={isDisabled}
          onChange={(event) => onChange('ofNumber', event.currentTarget.value)}
        />
      </label>
      <label className="field">
        <span>Oficina</span>
        <input
          type="text"
          autoComplete="off"
          placeholder="Nome da oficina"
          value={metadata.workshop}
          disabled={isDisabled}
          onChange={(event) => onChange('workshop', event.currentTarget.value)}
        />
      </label>
      <label className="field">
        <span>Cliente</span>
        <input
          type="text"
          autoComplete="off"
          placeholder="Nome do cliente"
          value={metadata.client}
          disabled={isDisabled}
          onChange={(event) => onChange('client', event.currentTarget.value)}
        />
      </label>
      <label className="field product-field">
        <span>Produto</span>
        <input
          type="text"
          autoComplete="off"
          placeholder="Descrição do produto"
          value={metadata.product}
          disabled={isDisabled}
          onChange={(event) => onChange('product', event.currentTarget.value)}
        />
      </label>
      <Button type="button" disabled={!canSave} onClick={onSave}>
        Salvar PDF
      </Button>
    </section>
  )
}
