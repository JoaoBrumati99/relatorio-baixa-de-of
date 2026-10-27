import { Button } from '../Button/Button'
import type { ReportItem } from '../../types/report'
import './ReportTable.css'

interface ReportTableProps {
  items: ReportItem[]
  isSaving: boolean
  onRemoveItem: (index: number) => void
}

const columns = [
  'Código',
  'Descrição de material',
  'Quant.',
  'Uni',
  'Lote',
  'Depósito',
  'Custo',
  'Total',
]

export function ReportTable({ items, isSaving, onRemoveItem }: ReportTableProps) {
  return (
    <table className="doc-table">
      <colgroup>
        {columns.map((column) => <col key={column} />)}
        <col />
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => <th key={column}>{column}</th>)}
          <th>Excluir</th>
        </tr>
      </thead>
      <tbody>
        {items.length ? items.map((item, index) => (
          <tr key={`${item.code}-${item.lot}-${index}`}>
            <td>{item.code}</td>
            <td>{item.description}</td>
            <td>{item.quantity}</td>
            <td>{item.unit}</td>
            <td>{item.lot}</td>
            <td>{item.deposit}</td>
            <td>{item.cost}</td>
            <td>{item.total}</td>
            <td className="delete-cell">
              <Button
                type="button"
                className="row-delete"
                disabled={isSaving}
                aria-label={`Excluir item ${item.code}`}
                title="Excluir este item do relatório"
                onClick={() => onRemoveItem(index)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 3h6l1 2h5v2H3V5h5l1-2zm-3 6h12l-1 12H7L6 9zm3 2v8h2v-8H9zm4 0v8h2v-8h-2z" />
                </svg>
              </Button>
            </td>
          </tr>
        )) : (
          <tr>
            <td className="empty-row" colSpan={9}>
              {isSaving ? 'Preparando relatório...' : 'Aguardando planilha'}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
