/**
 * Funções puras da importação de CSV/XLSX: leitura do texto, detecção de
 * colunas pelo cabeçalho, conversão de valores e datas e aplicação do
 * mapeamento. Extraídas de ImportCSVForm para serem testáveis sem React.
 */

import type { ParsedRow } from '@/lib/actions/import'

export interface ColumnMapping {
  dateIdx: number
  descIdx: number
  desc2Idx: number
  amountIdx: number
  creditIdx: number
  debitIdx: number
}

// ─── Valores e datas ──────────────────────────────────────────────────────────

export const AMOUNT_NOT_RECOGNIZED = 'Valor não reconhecido'

/**
 * Converte um valor de extrato em número com sinal. Aceita formato BR
 * (1.234,56) e US (1,234.56), prefixo "R$" em qualquer posição em relação ao
 * sinal ("- R$ 5,00", "-R$ 5,00", "R$ -5,00") e espaços entre sinal, moeda e
 * número. Devolve null quando o texto não é um número — quem chama decide o
 * que fazer (a prévia marca a linha como inválida). Vazio é 0.
 */
export function tryParseAmount(raw: string): number | null {
  const s = (raw ?? '').replace(/R\$/gi, '').replace(/[\s\u00a0]+/g, '')
  if (!s) return 0
  let n: number
  const commaIdx = s.lastIndexOf(',')
  const dotIdx = s.lastIndexOf('.')
  if (commaIdx !== -1 && dotIdx !== -1) {
    // Os dois separadores: o último é o decimal.
    n = dotIdx > commaIdx
      ? parseFloat(s.replace(/,/g, ''))                      // US: 1,913.44
      : parseFloat(s.replace(/\./g, '').replace(',', '.'))   // BR: 1.913,44
  } else if (commaIdx !== -1) {
    n = parseFloat(s.replace(',', '.'))
  } else {
    n = parseFloat(s)
  }
  return Number.isNaN(n) ? null : n
}

/** Como tryParseAmount, mas texto não numérico vira 0 (comportamento legado). */
export function parseAmount(raw: string): number {
  return tryParseAmount(raw) ?? 0
}

export function normalizeDate(raw: string): string {
  const s = (raw ?? '').trim().split(/[\sT]/)[0]
  if (!s || s.toLowerCase() === 'nan') return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/'); return `${y}-${m}-${d}`
  }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(s)) {
    const [d, m, y] = s.split('/'); return `20${y}-${m}-${d}`
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-'); return `${y}-${m}-${d}`
  }
  return ''
}

// ─── Detecção de colunas ──────────────────────────────────────────────────────

export function detectColumns(headers: string[]): ColumnMapping {
  const h = headers.map(c => String(c ?? '').toLowerCase().replace(/['"]/g, '').trim())

  const dateIdx = h.findIndex(c =>
    c === 'data' || c === 'date' || c === 'dt' || c === 'data lançamento' || c === 'data lancamento' ||
    c === 'data e hora' || c === 'data/hora' ||
    (c.includes('data') && !c.includes('cadastro') && !c.includes('criação') && !c.includes('criacao') && !c.includes('vencimento'))
  )

  const descIdx = h.findIndex(c =>
    c.includes('descri') || c.includes('histor') || c.includes('memo') ||
    c.includes('lancamento') || c.includes('lançamento') || c.includes('estabele') ||
    c.includes('detalhe') || c.includes('narrat') || c.includes('complemento') ||
    c === 'nome' || c === 'favorecido' || c === 'pagador'
  )

  const desc2Idx = h.findIndex((c, i) =>
    i !== descIdx && (c === 'transação' || c === 'transacao' || c.includes('transaç') || c === 'categoria' || c === 'tipo')
  )

  return {
    dateIdx,
    descIdx,
    desc2Idx,
    amountIdx: h.findIndex(c =>
      c === 'valor' || c === 'amount' || c === 'value' || c === 'valor (r$)' ||
      c.includes('valor') || c.includes('amount') || c.includes('montante')
    ),
    creditIdx: h.findIndex(c =>
      c.includes('cred') || c.includes('entrada') || c.includes('receita') || c === 'c'
    ),
    debitIdx: h.findIndex(c =>
      c.includes('déb') || c.includes('deb') || c.includes('saída') || c.includes('saida') ||
      c.includes('despesa') || c === 'd'
    ),
  }
}

export function isMappingValid(m: ColumnMapping): boolean {
  return m.dateIdx >= 0 && m.descIdx >= 0 && (m.amountIdx >= 0 || m.creditIdx >= 0 || m.debitIdx >= 0)
}

// ─── CSV bruto ────────────────────────────────────────────────────────────────

export function splitLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let field = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === delimiter && !inQuote) { result.push(field.trim()); field = '' }
    else { field += ch }
  }
  result.push(field.trim())
  return result
}

export function csvToRaw(content: string): { headers: string[]; rawRows: string[][] } {
  const lines = content.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean)
  if (lines.length < 2) return { headers: [], rawRows: [] }
  const delimiter = lines[0].includes(';') ? ';' : ','
  const headers = splitLine(lines[0], delimiter)
  const rawRows = lines.slice(1).map(l => splitLine(l, delimiter))
  return { headers, rawRows }
}

// ─── Mapeamento → linhas ──────────────────────────────────────────────────────

export function applyMapping(headers: string[], rawRows: string[][], mapping: ColumnMapping): ParsedRow[] {
  const { dateIdx, descIdx, desc2Idx, amountIdx, creditIdx, debitIdx } = mapping
  return rawRows.flatMap((parts, i) => {
    try {
      const rawDate = parts[dateIdx] ?? ''
      if (!rawDate || rawDate.toLowerCase() === 'nan') return []
      const date = normalizeDate(rawDate)
      if (!date) {
        return [{ date: '', description: parts.join(' '), amount: 0, type: 'expense' as const, raw: parts.join(' '), error: `Data inválida: "${rawDate || '(vazio)'}"` }]
      }
      const primary = desc2Idx >= 0 ? (parts[desc2Idx] ?? '').trim() : ''
      const secondary = descIdx >= 0 ? (parts[descIdx] ?? '').trim() : ''
      const description = [primary, secondary].filter(Boolean).join(' — ') || `Transação ${i + 1}`
      let amount = 0
      // Texto que não é número não pode virar 0 em silêncio: a linha volta
      // com erro (desmarcada na prévia) e o valor original no aviso.
      const invalid = (cell: string) => [{
        date, description, amount: 0, type: 'expense' as const, raw: parts.join(' '),
        error: `${AMOUNT_NOT_RECOGNIZED}: "${cell}" (${description})`,
      }]
      if (amountIdx >= 0) {
        const cell = parts[amountIdx] ?? '0'
        const v = tryParseAmount(cell)
        if (v === null) return invalid(cell)
        amount = v
      } else {
        const creditCell = parts[creditIdx] ?? '0'
        const debitCell = parts[debitIdx] ?? '0'
        const credit = tryParseAmount(creditCell)
        const debit = tryParseAmount(debitCell)
        if (credit === null) return invalid(creditCell)
        if (debit === null) return invalid(debitCell)
        amount = credit > 0 ? credit : -Math.abs(debit)
      }
      return [{ date, description, amount, type: amount >= 0 ? 'income' as const : 'expense' as const, raw: parts.join(' ') }]
    } catch {
      return [{ date: '', description: parts.join(' '), amount: 0, type: 'expense' as const, raw: parts.join(' '), error: 'Linha inválida' }]
    }
  })
}
