'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Upload, X, Loader2, AlertTriangle, FileSpreadsheet, FileText, File, Plus,
} from 'lucide-react'
import { importTransactions, type CSVRow } from '@/lib/actions/transactions'
import { parsePDFAction, type ParsedRow } from '@/lib/actions/import'
import { ensureDefaultCategoriesForImport, createCategory } from '@/lib/actions/categories'
import { formatDate, formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { Account, Category } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColumnMapping {
  dateIdx: number
  descIdx: number
  desc2Idx: number
  amountIdx: number
  creditIdx: number
  debitIdx: number
}

interface EditableRow {
  date: string
  description: string
  amount: number        // signed: negative = expense, positive = income
  type: 'income' | 'expense'
  categoryId: string | null
  checked: boolean
  error?: string
  raw: string
}

interface ImportResult {
  inserted: number
  duplicates: number
  errors: number
  errorDetails: string[]
}

type FileFormat = 'csv' | 'xlsx' | 'ofx' | 'pdf'
type Step = 'idle' | 'parsing' | 'mapping' | 'preview' | 'done'

interface ImportCSVFormProps {
  accounts: Account[]
  categories: Category[]
  onSuccess: () => void
  onCancel: () => void
}

// ─── Category suggestion ──────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/supermercado|mercado|mercearia|hortifruti|padaria|açougue|atacadão|carrefour|extra|pão.?de.?açúcar|bom.?de.?preço/i, 'Alimentação'],
  [/restaurante|lanchonete|burger|pizza|fast.?food|ifood|rappi|bar\b|café\b|churrasco|lanche/i, 'Alimentação'],
  [/farmácia|farmacia|drogaria|hospital|clínica|clinica|médico|medico|laborat|plano.?de.?saúde|unimed|hapvida/i, 'Saúde'],
  [/uber\b|99\b|táxi|taxi|metrô|metro|ônibus|onibus|estacionamento|pedágio|posto\b|combustível|combustivel|gasolina|etanol/i, 'Transporte'],
  [/netflix|spotify|amazon|disney|hbo|apple\b|google\b|deezer|globoplay|telecine|crunchyroll|prime.?video|youtube.*premium/i, 'Assinaturas'],
  [/aluguel|condomínio|condominio|iptu|luz\b|energia|água\b|gás\b|internet|telecom|vivo\b|claro\b|tim\b|oi\b/i, 'Moradia'],
  [/salário|salario|pagamento|holerite/i, 'Salário'],
  [/pix.?recebido|transf.*recebida|ted.?recebido|doc.?recebido/i, 'Transferência'],
  [/pix.?enviado|transf.*enviada|transferência|ted\b|doc\b/i, 'Transferência'],
]

const BALANCE_ROW_RE = /saldo.?diário|saldo.?do.?dia|saldo.?anterior/i

function suggestCategoryId(description: string, categories: Category[]): string | null {
  if (!description) return null
  for (const [regex, name] of CATEGORY_KEYWORDS) {
    if (regex.test(description)) {
      const match = categories.find(c => c.name.toLowerCase() === name.toLowerCase())
        ?? categories.find(c => c.name.toLowerCase().includes(name.toLowerCase()))
      if (match) return match.id
    }
  }
  // fallback: "Outros"
  return categories.find(c => c.name.toLowerCase() === 'outros')?.id ?? null
}

// ─── Parsed → Editable conversion ────────────────────────────────────────────

function parsedToEditable(parsed: ParsedRow[], categories: Category[]): EditableRow[] {
  return parsed.map(r => {
    const isBalanceRow = BALANCE_ROW_RE.test(r.description ?? '')
    return {
      date: r.date,
      description: r.description,
      amount: r.amount,
      type: r.type as 'income' | 'expense',
      categoryId: r.error || isBalanceRow ? null : suggestCategoryId(r.description, categories),
      checked: !r.error && !isBalanceRow,
      error: r.error,
      raw: r.raw ?? '',
    }
  })
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  const s = (raw ?? '').trim()
  if (!s) return 0
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(s.replace(/,/g, '')) || 0
}

function normalizeDate(raw: string): string {
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

function detectFormat(name: string): FileFormat | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'csv' || ext === 'txt') return 'csv'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  if (ext === 'ofx' || ext === 'qfx') return 'ofx'
  if (ext === 'pdf') return 'pdf'
  return null
}

// ─── Column detection ─────────────────────────────────────────────────────────

function detectColumns(headers: string[]): ColumnMapping {
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

function isMappingValid(m: ColumnMapping): boolean {
  return m.dateIdx >= 0 && m.descIdx >= 0 && (m.amountIdx >= 0 || m.creditIdx >= 0 || m.debitIdx >= 0)
}

// ─── CSV/XLSX raw parsing ─────────────────────────────────────────────────────

function splitLine(line: string, delimiter: string): string[] {
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

function csvToRaw(content: string): { headers: string[]; rawRows: string[][] } {
  const lines = content.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean)
  if (lines.length < 2) return { headers: [], rawRows: [] }
  const delimiter = lines[0].includes(';') ? ';' : ','
  const headers = splitLine(lines[0], delimiter)
  const rawRows = lines.slice(1).map(l => splitLine(l, delimiter))
  return { headers, rawRows }
}

function applyMapping(headers: string[], rawRows: string[][], mapping: ColumnMapping): ParsedRow[] {
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
      if (amountIdx >= 0) {
        amount = parseAmount(parts[amountIdx] ?? '0')
      } else {
        const credit = parseAmount(parts[creditIdx] ?? '0')
        const debit = parseAmount(parts[debitIdx] ?? '0')
        amount = credit > 0 ? credit : -Math.abs(debit)
      }
      return [{ date, description, amount, type: amount >= 0 ? 'income' as const : 'expense' as const, raw: parts.join(' ') }]
    } catch {
      return [{ date: '', description: parts.join(' '), amount: 0, type: 'expense' as const, raw: parts.join(' '), error: 'Linha inválida' }]
    }
  })
}

// ─── OFX parser ───────────────────────────────────────────────────────────────

function parseOFX(content: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  const blockRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let m
  while ((m = blockRe.exec(content)) !== null) {
    const block = m[1]
    const tag = (t: string) => block.match(new RegExp(`<${t}>([^<\\n\\r]+)`, 'i'))?.[1]?.trim() ?? ''
    const dtposted = tag('DTPOSTED')
    const trnamt = tag('TRNAMT')
    const memo = tag('MEMO') || tag('NAME') || tag('PAYEE') || 'Transação'
    const dm = dtposted.match(/^(\d{4})(\d{2})(\d{2})/)
    const date = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : ''
    const amount = parseFloat(trnamt.replace(',', '.')) || 0
    rows.push({
      date, description: memo, amount,
      type: amount >= 0 ? 'income' : 'expense',
      raw: block.trim(),
      error: date ? undefined : `Data inválida: ${dtposted}`,
    })
  }
  return rows
}

// ─── AmountCell ──────────────────────────────────────────────────────────────

function AmountCell({ amount, type, onChange }: {
  amount: number
  type: 'income' | 'expense'
  onChange: (signed: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const abs = Math.abs(amount)
  const colorClass = type === 'income' ? 'text-emerald-700' : 'text-red-700'

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        step="0.01"
        min="0"
        defaultValue={abs.toFixed(2)}
        onBlur={e => {
          const v = parseFloat(e.target.value) || 0
          onChange(type === 'expense' ? -v : v)
          setEditing(false)
        }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }}
        className={cn('w-full bg-transparent border-b border-emerald-400 focus:outline-none text-right font-medium py-0.5', colorClass)}
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Clique para editar"
      className={cn('w-full text-right font-medium py-0.5 hover:underline decoration-dotted', colorClass)}
    >
      {formatCurrency(abs)}
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportCSVForm({ accounts, categories: initialCategories, onSuccess, onCancel }: ImportCSVFormProps) {
  const [step, setStep] = useState<Step>('idle')
  const [format, setFormat] = useState<FileFormat | null>(null)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [editableRows, setEditableRows] = useState<EditableRow[]>([])
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [colMap, setColMap] = useState<ColumnMapping>({ dateIdx: -1, descIdx: -1, desc2Idx: -1, amountIdx: -1, creditIdx: -1, debitIdx: -1 })
  const [selectedAccount, setSelectedAccount] = useState(accounts[0]?.id ?? '')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [allCategories, setAllCategories] = useState<Category[]>(initialCategories)
  const [newCat, setNewCat] = useState<{ rowIdx: number; name: string; color: string; saving: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Ref so handleFile always reads the latest categories without stale closure
  const catsRef = useRef<Category[]>(initialCategories)
  useEffect(() => { catsRef.current = allCategories }, [allCategories])

  // Only create defaults if user has no categories — never overwrite existing state
  useEffect(() => {
    if (initialCategories.length === 0) {
      ensureDefaultCategoriesForImport().then(cats => {
        if (cats.length > 0) {
          setAllCategories(cats)
          catsRef.current = cats
        }
      })
    }
  }, [])

  function updateRow(idx: number, patch: Partial<EditableRow>) {
    setEditableRows(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  function toggleAll() {
    const validRows = editableRows.filter(r => !r.error)
    const allChecked = validRows.every(r => r.checked)
    setEditableRows(rows => rows.map(r => r.error ? r : { ...r, checked: !allChecked }))
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const fmt = detectFormat(file.name)
    if (!fmt) {
      setParseError('Formato não suportado. Use CSV, XLSX, OFX/QFX ou PDF.')
      return
    }

    setFileName(file.name)
    setFormat(fmt)
    setParseError(null)
    setEditableRows([])
    setResult(null)
    setStep('parsing')

    try {
      // Guarantee categories are loaded before suggesting (fixes race condition)
      let cats = catsRef.current
      if (cats.length === 0) {
        cats = await ensureDefaultCategoriesForImport()
        setAllCategories(cats)
        catsRef.current = cats
      }

      if (fmt === 'csv') {
        const text = await file.text()
        const { headers, rawRows: raw } = csvToRaw(text)
        if (!headers.length) { setParseError('Arquivo CSV vazio ou inválido.'); setStep('idle'); return }
        console.log('[CSV] Headers detectados:', headers)
        const detected = detectColumns(headers)
        const normalizedRaw = raw.map(r => headers.map((_, i) => r[i] ?? ''))
        setRawHeaders(headers); setRawRows(normalizedRaw); setColMap(detected)
        if (isMappingValid(detected)) {
          setEditableRows(parsedToEditable(applyMapping(headers, normalizedRaw, detected), cats))
          setStep('preview')
        } else { setStep('mapping') }
      }

      else if (fmt === 'xlsx') {
        const buffer = await file.arrayBuffer()
        const XLSX = await import('xlsx')
        const wb = XLSX.read(buffer, { type: 'array', raw: false })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
        if (all.length < 2) { setParseError('Planilha vazia ou sem dados.'); setStep('idle'); return }

        // Scan first 15 rows to find the actual header row (BTG has headers at row 10)
        let headerRowIdx = 0
        let detected = detectColumns([])
        for (let i = 0; i < Math.min(all.length - 1, 15); i++) {
          const candidate = (all[i] as unknown[]).map(h => String(h ?? ''))
          console.log(`[XLSX] Row ${i} candidata a cabeçalho:`, candidate)
          const candidateMapping = detectColumns(candidate)
          if (isMappingValid(candidateMapping)) {
            headerRowIdx = i
            detected = candidateMapping
            console.log(`[XLSX] Cabeçalho detectado na linha ${i}:`, candidate, '| mapping:', candidateMapping)
            break
          }
        }

        const headers = (all[headerRowIdx] as unknown[]).map(h => String(h ?? ''))
        const raw = (all.slice(headerRowIdx + 1) as unknown[][]).map(r =>
          headers.map((_, i) => String(r[i] ?? ''))
        )
        console.log(`[XLSX] Total linhas de dados: ${raw.length} | Colunas: ${headers.join(', ')}`)

        setRawHeaders(headers); setRawRows(raw); setColMap(detected)
        if (isMappingValid(detected)) {
          setEditableRows(parsedToEditable(applyMapping(headers, raw, detected), cats))
          setStep('preview')
        } else {
          console.log('[XLSX] Mapeamento automático falhou. Headers:', headers)
          setStep('mapping')
        }
      }

      else if (fmt === 'ofx') {
        const text = await file.text()
        const parsed = parseOFX(text)
        if (!parsed.length) { setParseError('Nenhuma transação encontrada no arquivo OFX.'); setStep('idle'); return }
        setEditableRows(parsedToEditable(parsed, cats))
        setStep('preview')
      }

      else if (fmt === 'pdf') {
        const fd = new FormData()
        fd.append('file', file)
        const parsed = await parsePDFAction(fd)
        if (!parsed.length || (parsed.length === 1 && parsed[0].error)) {
          setParseError(parsed[0]?.error ?? 'Nenhuma transação detectada no PDF.')
          setStep('idle'); return
        }
        setEditableRows(parsedToEditable(parsed, cats))
        setStep('preview')
      }
    } catch (err) {
      setParseError(`Erro ao processar o arquivo: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
      setStep('idle')
    }
  }

  function applyManualMapping() {
    const parsed = applyMapping(rawHeaders, rawRows, colMap)
    setEditableRows(parsedToEditable(parsed, catsRef.current))
    setStep('preview')
  }

  function handleCategoryChange(rowIdx: number, value: string) {
    if (value === '__new__') {
      setNewCat({ rowIdx, name: '', color: '#6b7280', saving: false })
    } else {
      updateRow(rowIdx, { categoryId: value || null })
    }
  }

  async function saveNewCategory() {
    if (!newCat || !newCat.name.trim()) return
    const rowIdx = newCat.rowIdx
    const name = newCat.name.trim()
    const color = newCat.color
    setNewCat(c => c ? { ...c, saving: true } : c)

    const result = await createCategory({ name, type: 'expense', icon: '📦', color })
    console.log('[ImportCSVForm] createCategory result:', JSON.stringify(result))
    if (result.error || !result.data) {
      console.log('[ImportCSVForm] Falhou — error:', result.error, '| data:', result.data)
      setNewCat(c => c ? { ...c, saving: false } : c)
      return
    }

    // Append directly — no second server call, no race condition
    const newCategory = result.data
    console.log('[ImportCSVForm] Categorias antes:', catsRef.current.length, catsRef.current.map(c => c.name))
    const updated = [...catsRef.current, newCategory].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    console.log('[ImportCSVForm] Categorias depois:', updated.length, '| nova:', newCategory.name, newCategory.id)
    setAllCategories(updated)
    catsRef.current = updated
    updateRow(rowIdx, { categoryId: newCategory.id })
    setNewCat(null)
  }

  async function handleImport() {
    if (!selectedAccount) return
    setImporting(true)
    const valid: CSVRow[] = editableRows
      .filter(r => r.checked && !r.error && r.date)
      .map(r => ({
        date: r.date,
        description: r.description,
        amount: r.type === 'expense' ? -Math.abs(r.amount) : Math.abs(r.amount),
        account_id: selectedAccount,
        category_id: r.categoryId ?? null,
      }))
    const res = await importTransactions(valid)
    setResult(res)
    setImporting(false)
    setStep('done')
    if (res.inserted > 0) setTimeout(onSuccess, 1500)
  }

  function reset() {
    setStep('idle'); setFormat(null); setFileName(''); setParseError(null)
    setEditableRows([]); setRawHeaders([]); setRawRows([]); setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const checkedRows = editableRows.filter(r => r.checked && !r.error && r.date)
  const errorRows = editableRows.filter(r => r.error)
  const validCount = editableRows.filter(r => !r.error).length

  // ── Result ──────────────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{result.inserted}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Inseridas</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{result.duplicates}</p>
            <p className="text-xs text-amber-600 mt-0.5">Duplicatas</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{result.errors}</p>
            <p className="text-xs text-red-600 mt-0.5">Erros</p>
          </div>
        </div>
        {result.errorDetails.length > 0 && (
          <div className="bg-red-50 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
            {result.errorDetails.map((e, i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
          </div>
        )}
        <button
          onClick={result.inserted > 0 ? onSuccess : onCancel}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg"
        >
          {result.inserted > 0 ? 'Ver transações' : 'Fechar'}
        </button>
      </div>
    )
  }

  // ── Normal flow ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Account selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Importar para a conta</label>
        <select
          value={selectedAccount}
          onChange={e => setSelectedAccount(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* File drop zone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Arquivo</label>
        <div
          onClick={() => step === 'idle' && fileRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-xl p-6 text-center transition-colors',
            step === 'idle' ? 'cursor-pointer hover:border-gray-300 hover:bg-gray-50' : '',
            fileName ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200',
          )}
        >
          {step === 'parsing' ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-sm text-gray-500">Processando arquivo{format === 'pdf' ? ' (isso pode levar alguns segundos)' : ''}…</p>
            </div>
          ) : fileName ? (
            <div className="flex items-center gap-3">
              <FormatIcon format={format} />
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-700 truncate">{fileName}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {format?.toUpperCase()}
                  {step === 'preview' && ` · ${checkedRows.length} selecionadas${errorRows.length > 0 ? `, ${errorRows.length} com erro` : ''}`}
                  {step === 'mapping' && ' · mapeamento necessário'}
                </p>
              </div>
              <button onClick={e => { e.stopPropagation(); reset() }} className="p-1 text-gray-400 hover:text-gray-600 rounded shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">Clique para selecionar o arquivo</p>
              <p className="text-xs text-gray-400 mt-1">CSV, XLSX, OFX/QFX ou PDF</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,.ofx,.qfx,.pdf" className="hidden" onChange={handleFile} />
        </div>

        {parseError && (
          <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{parseError}</p>
          </div>
        )}
      </div>

      {/* Column mapping */}
      {step === 'mapping' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Não foi possível detectar as colunas automaticamente. Selecione quais colunas correspondem a cada campo.
            </p>
          </div>

          <div className="border border-gray-100 rounded-xl overflow-auto max-h-32">
            <table className="text-xs min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {rawHeaders.map((h, i) => (
                    <th key={i} className="px-2 py-1.5 text-left text-gray-500 font-medium whitespace-nowrap">
                      {h || `Col. ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rawRows.slice(0, 3).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1.5 text-gray-600 whitespace-nowrap max-w-[100px] truncate">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([
              ['Data *', 'dateIdx'],
              ['Descrição *', 'descIdx'],
              ['Valor (único)', 'amountIdx'],
            ] as [string, keyof ColumnMapping][]).map(([label, key]) => (
              <div key={key} className={key === 'descIdx' ? 'col-span-2 sm:col-span-1' : ''}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <select
                  value={colMap[key]}
                  onChange={e => setColMap(m => ({ ...m, [key]: +e.target.value }))}
                  className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                >
                  <option value={-1}>— selecionar —</option>
                  {rawHeaders.map((h, i) => <option key={i} value={i}>{h || `Col. ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
            <div className="col-span-2 grid grid-cols-2 gap-3">
              {([
                ['Crédito (alternativo)', 'creditIdx'],
                ['Débito (alternativo)', 'debitIdx'],
              ] as [string, keyof ColumnMapping][]).map(([label, key]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <select
                    value={colMap[key]}
                    onChange={e => setColMap(m => ({ ...m, [key]: +e.target.value, amountIdx: -1 }))}
                    className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value={-1}>— nenhuma —</option>
                    {rawHeaders.map((h, i) => <option key={i} value={i}>{h || `Col. ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={applyManualMapping}
            disabled={!isMappingValid(colMap)}
            className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Aplicar mapeamento
          </button>
        </div>
      )}

      {/* Preview table with inline editing */}
      {step === 'preview' && editableRows.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">
              Pré-visualização
              <span className="text-gray-400 font-normal ml-1">
                ({checkedRows.length} de {validCount} selecionadas{errorRows.length > 0 ? `, ${errorRows.length} com erro` : ''})
              </span>
            </p>
            <button
              onClick={toggleAll}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              {checkedRows.length === validCount ? 'Desmarcar todas' : 'Selecionar todas'}
            </button>
          </div>

          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col className="w-8" />
                  <col className="w-24" />
                  <col />
                  <col className="w-36" />
                  <col className="w-24" />
                  <col className="w-24" />
                </colgroup>
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={checkedRows.length === validCount && validCount > 0}
                        onChange={toggleAll}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </th>
                    <th className="text-left px-2 py-2 text-gray-500 font-medium">Data</th>
                    <th className="text-left px-2 py-2 text-gray-500 font-medium">Descrição</th>
                    <th className="text-left px-2 py-2 text-gray-500 font-medium">Categoria</th>
                    <th className="text-left px-2 py-2 text-gray-500 font-medium">Tipo</th>
                    <th className="text-right px-2 py-2 text-gray-500 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {editableRows.map((row, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'transition-opacity',
                        row.error ? 'bg-red-50' : !row.checked ? 'opacity-40 bg-gray-50' : 'hover:bg-gray-50/50',
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.checked}
                          onChange={e => updateRow(i, { checked: e.target.checked })}
                          disabled={!!row.error}
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>

                      {/* Date */}
                      <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">
                        {row.date ? formatDate(row.date) : <span className="text-red-400" title={row.error}>!</span>}
                      </td>

                      {/* Description */}
                      <td className="px-2 py-1.5 overflow-hidden">
                        {row.error ? (
                          <span className="block truncate text-red-500 italic" title={row.error}>{row.error}</span>
                        ) : (
                          <input
                            value={row.description}
                            onChange={e => updateRow(i, { description: e.target.value })}
                            title={row.description}
                            className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-400 focus:outline-none text-gray-800 py-0.5 transition-colors truncate"
                          />
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-2 py-1.5">
                        <select
                          value={row.categoryId ?? ''}
                          onChange={e => handleCategoryChange(i, e.target.value)}
                          disabled={!!row.error}
                          className="w-full bg-transparent text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded text-xs py-0.5 border border-transparent hover:border-gray-200 transition-colors"
                        >
                          <option value="">— categoria —</option>
                          {allCategories.map(c => (
                            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                          ))}
                          <option value="__new__">+ Nova categoria</option>
                        </select>
                      </td>

                      {/* Type toggle */}
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => updateRow(i, {
                            type: row.type === 'income' ? 'expense' : 'income',
                            amount: -row.amount,
                          })}
                          disabled={!!row.error}
                          className={cn(
                            'w-full px-1 py-0.5 rounded-full text-xs font-medium text-center transition-colors',
                            row.type === 'income'
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-red-100 text-red-700 hover:bg-red-200',
                          )}
                        >
                          {row.type === 'income' ? 'Receita' : 'Despesa'}
                        </button>
                      </td>

                      {/* Amount */}
                      <td className="px-2 py-1.5">
                        {row.error ? (
                          <span className="block text-right text-red-400">—</span>
                        ) : (
                          <AmountCell
                            amount={row.amount}
                            type={row.type}
                            onChange={v => updateRow(i, { amount: v })}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inline new category form */}
          {newCat && (
            <div className="mt-2 border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-emerald-800">Nova categoria</p>
              <div className="flex gap-2 items-center">
                <input
                  autoFocus
                  placeholder="Nome da categoria"
                  value={newCat.name}
                  onChange={e => setNewCat(c => c ? { ...c, name: e.target.value } : c)}
                  onKeyDown={e => { if (e.key === 'Enter') saveNewCategory(); if (e.key === 'Escape') setNewCat(null) }}
                  className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <div className="flex gap-1 shrink-0">
                  {['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#6b7280','#9ca3af'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewCat(c => c ? { ...c, color } : c)}
                      className={cn('w-5 h-5 rounded-full transition-transform', newCat.color === color ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : '')}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setNewCat(null)} className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg bg-white">
                  Cancelar
                </button>
                <button
                  onClick={saveNewCategory}
                  disabled={!newCat.name.trim() || newCat.saving}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 rounded-lg"
                >
                  {newCat.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Salvar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
        {step === 'preview' && (
          <button
            onClick={handleImport}
            disabled={checkedRows.length === 0 || !selectedAccount || importing}
            className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {importing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando…</>
              : `Importar ${checkedRows.length} transações`
            }
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Format icon ──────────────────────────────────────────────────────────────

function FormatIcon({ format }: { format: FileFormat | null }) {
  if (format === 'xlsx') return <FileSpreadsheet className="w-8 h-8 text-emerald-600 shrink-0" />
  if (format === 'pdf') return <FileText className="w-8 h-8 text-red-500 shrink-0" />
  if (format === 'ofx') return <File className="w-8 h-8 text-blue-500 shrink-0" />
  return <File className="w-8 h-8 text-emerald-500 shrink-0" />
}
