import type { ParsedSpreadsheet, ReportItem } from '../types/report'

function normalize(value: unknown) {
  return String(value ?? '')
    .replace(/\uFFFD/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function valueText(value: unknown) {
  if (value == null) return ''
  if (value instanceof Date) {
    return `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}`
  }
  return String(value).trim().replace(/^"|"$/g, '')
}

function getNameAndSurname(value: unknown) {
  const name = valueText(value).split('//', 1)[0].trim()
  const parts = name.replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean)
  if (parts.length < 2) return parts[0] || ''
  return `${parts[0]} ${parts[parts.length - 1]}`
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let text = String(value).trim()
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.')
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function formatNumber(value: number | null) {
  if (value == null) return ''
  return (Math.round(value * 10000) / 10000).toLocaleString('pt-BR', {
    useGrouping: false,
    maximumFractionDigits: 4,
  })
}

function parseMoney(value: unknown) {
  if (value == null || value === '') return null
  return parseNumber(String(value).replace(/[^\d,.-]/g, ''))
}

function formatCurrency(value: number | null, maximumFractionDigits = 2) {
  if (value == null) return ''
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits })}`
}

function combineDuplicateItems(items: ReportItem[]) {
  const groups = new Map<string, ReportItem[]>()
  for (const item of items) {
    const key = `${item.code.trim().toLocaleUpperCase('pt-BR')}\u0000${item.deposit.trim()}`
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }

  const combined: ReportItem[] = []
  for (const group of groups.values()) {
    const amounts = group.map((item) => ({
      quantity: parseNumber(item.quantity),
      total: parseMoney(item.total),
    }))
    if (group.length === 1 || amounts.some(({ quantity, total }) => quantity == null || total == null)) {
      combined.push(...group)
      continue
    }

    const quantity = amounts.reduce((sum, amount) => sum + amount.quantity!, 0)
    const total = amounts.reduce((sum, amount) => sum + amount.total!, 0)
    combined.push({
      ...group[0],
      quantity: formatNumber(quantity),
      cost: formatCurrency(quantity === 0 ? null : total / quantity, 4),
      total: formatCurrency(total),
    })
  }

  return combined
}

function parseCsv(source: string): string[][] {
  const firstLine = source.split(/\r?\n/, 1)[0] || ''
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === delimiter && !quoted) {
      row.push(field)
      field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  row.push(field)
  if (row.some((cell) => cell.trim())) rows.push(row)
  return rows
}

async function readRows(file: File): Promise<unknown[][]> {
  const bytes = await file.arrayBuffer()
  if (file.name.toLowerCase().endsWith('.csv')) {
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes)
    }
    return parseCsv(text.replace(/^\uFEFF/, ''))
  }

  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  await workbook.xlsx.load(bytes)
  const firstSheet = workbook.worksheets[0]
  if (!firstSheet) throw new Error('A planilha não possui uma aba com dados.')
  const rows: unknown[][] = []
  firstSheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values
    rows.push(Array.isArray(values) ? values.slice(1) : [])
  })
  return rows
}

export async function readSpreadsheet(file: File): Promise<ParsedSpreadsheet> {
  const rows = await readRows(file)
  if (!rows.length) throw new Error('O arquivo selecionado está vazio.')

  const headers = rows[0].map(valueText)
  const findColumn = (name: string) => headers.findIndex((header) => normalize(header) === name)
  const columns = {
    code: findColumn('codigo'),
    deposit: findColumn('deposito'),
    quantity: findColumn('qtde'),
    unit: findColumn('unidade'),
    cost: headers.findIndex((header) => [
      'custo', 'custounitario', 'valorunitario', 'vlunitario', 'precounitario', 'preco',
    ].includes(normalize(header))),
    of: findColumn('numeroof'),
    product: findColumn('produto'),
    operator: headers.findIndex((header) => [
      'descusuario', 'usuario', 'nomeusuario',
    ].includes(normalize(header))),
  }
  if (columns.of < 0) columns.of = findColumn('of')

  const required = ['code', 'quantity', 'unit', 'cost'] as const
  const missing = required.filter((key) => columns[key] < 0)
  if (missing.length) {
    if (headers.length === 2 && /^\d+$/.test(headers[0]) && parseNumber(headers[1]) != null) {
      throw new Error('Esse parece ser o arquivo auxiliar de saldos (código;saldo), não o relatório de movimentações. Selecione a exportação do sistema.')
    }
    const missingLabels = missing.map((key) => key === 'cost' ? 'custo unitário' : key)
    throw new Error(`Colunas obrigatórias não encontradas: ${missingLabels.join(', ')}. Confira se selecionou o relatório de movimentações.`)
  }

  const dataRows = rows.slice(1)
  const first = dataRows.find((row) => row.some((cell) => valueText(cell)))
  const items: ReportItem[] = []
  let operatorName = ''

  for (const row of dataRows) {
    if (!row.some((cell) => valueText(cell))) continue
    if (columns.operator >= 0) {
      operatorName = getNameAndSurname(row[columns.operator]) || operatorName
    }
    let deposit = columns.deposit >= 0 ? valueText(row[columns.deposit]) : ''
    if (/^\d+$/.test(deposit)) deposit = deposit.padStart(4, '0')

    const quantity = parseNumber(row[columns.quantity])
    const cost = parseMoney(row[columns.cost])
    items.push({
      code: valueText(row[columns.code]),
      description: valueText(row[columns.code + 1]),
      quantity: formatNumber(quantity),
      unit: valueText(row[columns.unit]),
      deposit,
      depositDescription: columns.deposit >= 0 ? valueText(row[columns.deposit + 1]) : '',
      cost: formatCurrency(cost, 4),
      total: quantity == null || cost == null ? '' : formatCurrency(quantity * cost),
    })
  }

  const combinedItems = combineDuplicateItems(items)
  const deposits = [...new Set(items.map((item) => item.deposit).filter(Boolean))].sort()
  const descriptions = [...new Set(items.map((item) => item.depositDescription).filter(Boolean))].sort()
  const depositDescription = deposits.length === 1 && descriptions.length
    ? `${deposits[0]} - ${descriptions[0].split(' MG (')[0]}`
    : deposits.join(' / ')

  return {
    items: combinedItems,
    combinedCount: items.length - combinedItems.length,
    deposit: depositDescription,
    ...(operatorName ? { operatorName } : {}),
    ...(columns.of >= 0 && first ? { ofNumber: valueText(first[columns.of]) } : {}),
    ...(columns.product >= 0 && first ? { product: valueText(first[columns.product]) } : {}),
  }
}
