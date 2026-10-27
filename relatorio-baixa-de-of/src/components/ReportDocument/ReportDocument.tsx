import { ReportTable } from '../ReportTable/ReportTable'
import type { ReportItem, ReportMetadata } from '../../types/report'
import './ReportDocument.css'

interface ReportDocumentProps {
  identification: number | null
  items: ReportItem[]
  metadata: ReportMetadata
  timestamp: Date
  isSaving: boolean
  onRemoveItem: (index: number) => void
}

export function ReportDocument({
  identification,
  items,
  metadata,
  timestamp,
  isSaving,
  onRemoveItem,
}: ReportDocumentProps) {
  return (
    <article className="paper" id="paper">
      <header className="doc-head">
        <img className="doc-logo" src="/logo_amalfis.png" alt="AMALFIS" />
        <div className="doc-company">
          <div>AMALFIS UNIFORMES CONFECCAO DE ROUPAS LTDA ME</div>
          <div>CNPJ: 11.744.716/0001-10</div>
        </div>
        <div className="doc-user">
          <div>{timestamp.toLocaleDateString('pt-BR')}</div>
          <div>{timestamp.toLocaleTimeString('pt-BR')}</div>
          <div>JOAO.BRUMATI</div>
          <div>Identificação: {identification === null ? '--' : String(identification).padStart(2, '0')}</div>
        </div>
      </header>
      <section className="doc-meta">
        <div>Número OF:</div><div>{metadata.ofNumber}</div>
        <div>Produto:</div><div>{metadata.product}</div>
        <div>Cliente:</div><div>{metadata.client}</div>
        <div>Oficina:</div><div>{metadata.workshop}</div>
      </section>
      <ReportTable items={items} isSaving={isSaving} onRemoveItem={onRemoveItem} />
      <section className="signatures">
        <Signature caption="Assinatura Almoxarifado" />
        <Signature caption="Assinatura Requisitante" />
        <Signature caption="Assinatura Externo" />
      </section>
    </article>
  )
}

function Signature({ caption }: { caption: string }) {
  return (
    <div className="signature">
      <span>DATA:</span><span className="rule" />
      <span>NOME:</span><span className="rule" />
      <span className="caption">{caption}</span>
    </div>
  )
}
