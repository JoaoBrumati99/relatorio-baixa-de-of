export interface ReportItem {
  code: string
  description: string
  quantity: string
  unit: string
  deposit: string
  depositDescription: string
  cost: string
  total: string
}

export interface ReportMetadata {
  ofNumber: string
  workshop: string
  client: string
  product: string
}

export interface ReportPayload {
  metadata: ReportMetadata
  deposit: string
  items: ReportItem[]
}

export interface ParsedSpreadsheet {
  items: ReportItem[]
  combinedCount: number
  deposit: string
  operatorName?: string
  ofNumber?: string
  product?: string
}
