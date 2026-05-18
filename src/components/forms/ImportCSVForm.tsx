'use client'

import { useState, useRef } from 'react'
import {
  Upload, X, CheckCircle, AlertCircle, Loader2, AlertTriangle,
  FileSpreadsheet, FileText, File,
} from 'lucide-react'
import { importTransactions, type CSVRow } from '@/lib/actions/transactions'
import { parsePDFAction, type ParsedRow } from '@/lib/actions/import'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { Account, Category } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColumnMapping {
  dateIdx: number
  descIdx: number
  desc2Idx: number  // secondary description column (e.g. BTG "Transação")
  amountIdx: number
  creditIdx: number
  debitIdx: number
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

// ─── Utilities ────────────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  const s = (raw ?? '').trim()
  if (!s) return 0
  // BR format: 1.234,56 → 1234.56
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(s.replace(/,/g, '')) || 0
}

function normalizeDate(raw: string): string {
  // Strip time portion from datetime strings like "04/04/2026 18:24" or "2026-04-04T18:24:00"
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

  // Primary description: name/establishment/memo
  const descIdx = h.findIndex(c =>
    c.includes('descri') || c.includes('histor') || c.includes('memo') ||
    c.includes('lancamento') || c.includes('lançamento') || c.includes('estabele') ||
    c.includes('detalhe') || c.includes('narrat') || c.includes('complemento') ||
    c === 'nome' || c === 'favorecido' || c === 'pagador'
  )

  // Secondary description: transaction type (BTG "Transação", "Categoria")
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
      // Skip balance/summary rows (NaN date or empty)
      if (!rawDate || rawDate.toLowerCase() === 'nan') return []
      const date = normalizeDate(rawDate)
      if (!date) {
        return [{ date: '', description: parts.join(' '), amount: 0, type: 'expense' as const, raw: parts.join(' '), error: `Data inválida: "${rawDate || '(vazio)'}"` }]
      }
      // Combine primary + secondary description (e.g. BTG: "Pix recebido" + "João Silva")
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

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportCSVForm({ accounts, onSuccess, onCancel }: ImportCSVFormProps) {
  const [step, setStep] = useState<Step>('idle')
  const [format, setFormat] = useState<FileFormat | null>(null)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [colMap, setColMap] = useState<ColumnMapping>({ dateIdx: -1, descIdx: -1, desc2Idx: -1, amountIdx: -1, creditIdx: -1, debitIdx: -1 })
  const [selectedAccount, setSelectedAccount] = useState(accounts[0]?.id ?? '')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
    setRows([])
    setResult(null)
    setStep('parsing')

    try {
      if (fmt === 'csv') {
        const text = await file.text()
        const { headers, rawRows: raw } = csvToRaw(text)
        if (!headers.length) { setParseError('Arquivo CSV vazio ou inválido.'); setStep('idle'); return }
        console.log('[CSV] Headers detectados:', headers)
        const detected = detectColumns(headers)
        // Normalize each row to same length as headers
        const normalizedRaw = raw.map(r => headers.map((_, i) => r[i] ?? ''))
        setRawHeaders(headers); setRawRows(normalizedRaw); setColMap(detected)
        if (isMappingValid(detected)) { setRows(applyMapping(headers, normalizedRaw, detected)); setStep('preview') }
        else { setStep('mapping') }
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
        // Normalize each row to same length as headers to avoid undefined access
        const raw = (all.slice(headerRowIdx + 1) as unknown[][]).map(r =>
          headers.map((_, i) => String(r[i] ?? ''))
        )
        console.log(`[XLSX] Total linhas de dados: ${raw.length} | Colunas: ${headers.join(', ')}`)

        if (!isMappingValid(detected)) {
          console.log('[XLSX] Mapeamento automático falhou, abrindo mapeamento manual. Headers:', headers)
        }

        setRawHeaders(headers); setRawRows(raw); setColMap(detected)
        if (isMappingValid(detected)) { setRows(applyMapping(headers, raw, detected)); setStep('preview') }
        else { setStep('mapping') }
      }

      else if (fmt === 'ofx') {
        const text = await file.text()
        const parsed = parseOFX(text)
        if (!parsed.length) { setParseError('Nenhuma transação encontrada no arquivo OFX.'); setStep('idle'); return }
        setRows(parsed); setStep('preview')
      }

      else if (fmt === 'pdf') {
        const fd = new FormData()
        fd.append('file', file)
        const parsed = await parsePDFAction(fd)

        if (!parsed.length || (parsed.length === 1 && parsed[0].error)) {
          setParseError(parsed[0]?.error ?? 'Nenhuma transação detectada no PDF.')
          setStep('idle'); return
        }
        setRows(parsed); setStep('preview')
      }
    } catch (err) {
      setParseError(`Erro ao processar o arquivo: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
      setStep('idle')
    }
  }

  function applyManualMapping() {
    setRows(applyMapping(rawHeaders, rawRows, colMap))
    setStep('preview')
  }

  async function handleImport() {
    if (!selectedAccount) return
    setImporting(true)
    const valid: CSVRow[] = rows
      .filter(r => !r.error && r.date)
      .map(r => ({ date: r.date, description: r.description, amount: r.amount, account_id: selectedAccount }))
    const res = await importTransactions(valid)
    setResult(res)
    setImporting(false)
    setStep('done')
    if (res.inserted > 0) setTimeout(onSuccess, 1500)
  }

  function reset() {
    setStep('idle'); setFormat(null); setFileName(''); setParseError(null)
    setRows([]); setRawHeaders([]); setRawRows([]); setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const validRows = rows.filter(r => !r.error)
  const invalidRows = rows.filter(r => r.error)

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
      {/* Account selector — always visible */}
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
                  {step === 'preview' && ` · ${validRows.length} válidas${invalidRows.length > 0 ? `, ${invalidRows.length} com erro` : ''}`}
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

          {/* Raw data preview */}
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

      {/* Preview table */}
      {step === 'preview' && rows.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Pré-visualização
            <span className="text-gray-400 font-normal ml-1">
              ({validRows.length} válidas{invalidRows.length > 0 ? `, ${invalidRows.length} com erro` : ''})
            </span>
          </p>
          <div className="border border-gray-100 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Data</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Descrição</th>
                  <th className="text-right px-3 py-2 text-gray-500 font-medium">Valor</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className={row.error ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {row.date ? formatDate(row.date) : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-800 max-w-[180px] truncate" title={row.error}>
                      {row.description}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-medium whitespace-nowrap', row.amount >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {row.error ? '—' : formatCurrency(Math.abs(row.amount))}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {row.error
                        ? <span title={row.error}><AlertCircle className="w-3.5 h-3.5 text-red-400" /></span>
                        : <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && (
              <p className="text-xs text-gray-400 text-center py-2 border-t border-gray-50">
                +{rows.length - 50} linhas não exibidas
              </p>
            )}
          </div>
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
            disabled={validRows.length === 0 || !selectedAccount || importing}
            className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {importing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando…</>
              : `Importar ${validRows.length} transações`
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
