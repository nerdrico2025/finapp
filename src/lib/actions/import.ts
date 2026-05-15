'use server'

export interface ParsedRow {
  date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  raw?: string
  error?: string
}

// ─── PDF heuristics ───────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
}

// Matches BR amounts: 1.234,56 | -1.234,56 | 234,56 | 1234,56
const AMOUNT_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)|-?\d{1,10},\d{2}(?!\d)/g

// Lines to skip (headers, totals, separators)
const SKIP_RE = /^(data|descrição|descriçao|valor|saldo|total|período|extrato|lançamento|banco|agencia|conta|cpf|cnpj|cliente|nome|período)/i

function parseDate(raw: string): string {
  raw = raw.trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split('/')
    return `${y}-${m}-${d}`
  }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(raw)) {
    const [d, m, y] = raw.split('/')
    return `20${y}-${m}-${d}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return ''
}

function extractTransactions(text: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  const currentYear = new Date().getFullYear()

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length < 8) continue
    if (SKIP_RE.test(line)) continue

    let date = ''
    let rest = line

    // dd/mm/yyyy or dd/mm/yy at start
    const stdDate = line.match(/^(\d{2}\/\d{2}\/\d{2,4})/)
    if (stdDate) {
      date = parseDate(stdDate[1])
      rest = line.slice(stdDate[1].length).trim()
    }

    // yyyy-mm-dd at start
    if (!date) {
      const isoDate = line.match(/^(\d{4}-\d{2}-\d{2})/)
      if (isoDate) {
        date = isoDate[1]
        rest = line.slice(isoDate[1].length).trim()
      }
    }

    // dd Mon [yyyy] — e.g. "15 jan" or "15 jan 2024"
    if (!date) {
      const mthDate = line.match(/^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\s+(\d{2,4}))?/i)
      if (mthDate) {
        const d = mthDate[1].padStart(2, '0')
        const m = MONTH_MAP[mthDate[2].toLowerCase()]
        const rawYear = mthDate[3]
        const y = rawYear
          ? (rawYear.length === 2 ? `20${rawYear}` : rawYear)
          : String(currentYear)
        date = `${y}-${m}-${d}`
        rest = line.slice(mthDate[0].length).trim()
      }
    }

    if (!date) continue

    // Find all amount-like strings in the rest of the line
    const amounts = Array.from(rest.matchAll(AMOUNT_RE))
    if (amounts.length === 0) continue

    // Use the last amount on the line (most likely the transaction value)
    const lastMatch = amounts[amounts.length - 1]
    const amountStr = lastMatch[0]
    const description = rest.slice(0, lastMatch.index).trim().replace(/\s+/g, ' ') || 'Transação'

    // Check for trailing minus (Itaú format: 234,56-)
    let amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'))
    const afterAmount = rest.slice((lastMatch.index ?? 0) + amountStr.length).trim()
    if (afterAmount.startsWith('-')) amount = -Math.abs(amount)

    if (isNaN(amount) || amount === 0) continue

    rows.push({
      date,
      description,
      amount,
      type: amount >= 0 ? 'income' : 'expense',
      raw: line,
    })
  }

  return rows
}

// ─── Server action ────────────────────────────────────────────────────────────

export async function parsePDFAction(formData: FormData): Promise<ParsedRow[]> {
  const file = formData.get('file') as File | null
  if (!file) return []

  const buffer = Buffer.from(await file.arrayBuffer())

  let text: string
  try {
    // Dynamic import — handle both CJS (.default) and ESM exports
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfModule: any = await import('pdf-parse')
    const pdfParse: (buf: Buffer) => Promise<{ text: string }> =
      typeof pdfModule.default === 'function' ? pdfModule.default : pdfModule
    const result = await pdfParse(buffer)
    text = result.text
  } catch {
    return [{ date: '', description: 'Erro ao ler PDF', amount: 0, type: 'expense', error: 'PDF ilegível, criptografado ou baseado em imagem.' }]
  }

  if (!text.trim()) {
    return [{ date: '', description: '', amount: 0, type: 'expense', error: 'PDF sem texto selecionável. Provavelmente é um PDF escaneado.' }]
  }

  return extractTransactions(text)
}
