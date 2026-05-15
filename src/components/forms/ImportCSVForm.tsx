'use client'

import { useState, useRef } from 'react'
import { Upload, X, CheckCircle, AlertCircle, SkipForward, Loader2 } from 'lucide-react'
import { importTransactions, type CSVRow } from '@/lib/actions/transactions'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { Account, Category } from '@/types'

interface ParsedRow {
  date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  raw: string
  error?: string
}

interface ImportResult {
  inserted: number
  duplicates: number
  errors: number
  errorDetails: string[]
}

interface ImportCSVFormProps {
  accounts: Account[]
  categories: Category[]
  onSuccess: () => void
  onCancel: () => void
}

// ─── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(content: string): ParsedRow[] {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return []

  const header = lines[0].toLowerCase()
  const rows: ParsedRow[] = []

  // Detect delimiter
  const delimiter = header.includes(';') ? ';' : ','

  // Detect column indices
  const cols = header.split(delimiter).map((c) => c.replace(/['"]/g, '').trim())
  const dateIdx = cols.findIndex((c) => c.includes('data') || c.includes('date'))
  const descIdx = cols.findIndex((c) => c.includes('descri') || c.includes('histor') || c.includes('memo'))
  const amountIdx = cols.findIndex((c) => c.includes('valor') || c.includes('amount') || c.includes('value'))
  const creditIdx = cols.findIndex((c) => c.includes('cred') || c.includes('entrada'))
  const debitIdx = cols.findIndex((c) => c.includes('deb') || c.includes('saída') || c.includes('saida'))

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    try {
      const parts = raw.split(delimiter).map((p) => p.replace(/^["']|["']$/g, '').trim())

      // Parse date (supports dd/mm/yyyy, yyyy-mm-dd)
      const rawDate = parts[dateIdx] ?? ''
      let date = ''
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        date = rawDate
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
        const [d, m, y] = rawDate.split('/')
        date = `${y}-${m}-${d}`
      } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(rawDate)) {
        const [d, m, y] = rawDate.split('/')
        date = `20${y}-${m}-${d}`
      } else {
        rows.push({ date: '', description: raw, amount: 0, type: 'expense', raw, error: `Data inválida: ${rawDate}` })
        continue
      }

      const description = parts[descIdx] ?? `Transação ${i}`

      // Parse amount
      let amount = 0
      if (amountIdx >= 0) {
        const raw = parts[amountIdx] ?? '0'
        amount = parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0
      } else if (creditIdx >= 0 || debitIdx >= 0) {
        const credit = parseFloat((parts[creditIdx] ?? '0').replace(/\./g, '').replace(',', '.')) || 0
        const debit = parseFloat((parts[debitIdx] ?? '0').replace(/\./g, '').replace(',', '.')) || 0
        amount = credit > 0 ? credit : -debit
      }

      rows.push({
        date,
        description,
        amount,
        type: amount >= 0 ? 'income' : 'expense',
        raw,
      })
    } catch {
      rows.push({ date: '', description: raw, amount: 0, type: 'expense', raw, error: 'Linha inválida' })
    }
  }

  return rows
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ImportCSVForm({ accounts, categories, onSuccess, onCancel }: ImportCSVFormProps) {
  const [preview, setPreview] = useState<ParsedRow[] | null>(null)
  const [selectedAccount, setSelectedAccount] = useState(accounts[0]?.id ?? '')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      const parsed = parseCSV(content)
      setPreview(parsed)
      setResult(null)
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleImport() {
    if (!preview || !selectedAccount) return
    setImporting(true)

    const validRows: CSVRow[] = preview
      .filter((r) => !r.error && r.date)
      .map((r) => ({
        date: r.date,
        description: r.description,
        amount: r.amount,
        account_id: selectedAccount,
      }))

    const res = await importTransactions(validRows)
    setResult(res)
    setImporting(false)

    if (res.inserted > 0) {
      setTimeout(onSuccess, 1500)
    }
  }

  const validRows = preview?.filter((r) => !r.error) ?? []
  const invalidRows = preview?.filter((r) => r.error) ?? []

  return (
    <div className="space-y-5">
      {!result ? (
        <>
          {/* File input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Arquivo CSV</label>
            <div
              onClick={() => fileRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                fileName ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <Upload className={cn('w-8 h-8 mx-auto mb-2', fileName ? 'text-emerald-500' : 'text-gray-300')} />
              {fileName ? (
                <p className="text-sm font-medium text-emerald-700">{fileName}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-500">Clique para selecionar o arquivo</p>
                  <p className="text-xs text-gray-400 mt-1">CSV com colunas: data, descrição, valor</p>
                </>
              )}
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
            </div>
          </div>

          {/* Account selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Importar para a conta</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>

          {/* Preview */}
          {preview && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">
                  Pré-visualização{' '}
                  <span className="text-gray-400 font-normal">({validRows.length} válidas, {invalidRows.length} com erro)</span>
                </p>
                <button
                  onClick={() => { setPreview(null); setFileName(''); if (fileRef.current) fileRef.current.value = '' }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Limpar
                </button>
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Data</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Descrição</th>
                      <th className="text-right px-3 py-2 text-gray-500 font-medium">Valor</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.slice(0, 50).map((row, i) => (
                      <tr key={i} className={row.error ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {row.date ? formatDate(row.date) : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-800 max-w-[180px] truncate">
                          {row.description}
                        </td>
                        <td className={cn(
                          'px-3 py-2 text-right font-medium whitespace-nowrap',
                          row.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                        )}>
                          {row.error ? '—' : formatCurrency(Math.abs(row.amount))}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.error ? (
                            <span title={row.error}>
                              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                            </span>
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 50 && (
                  <p className="text-xs text-gray-400 text-center py-2 border-t border-gray-50">
                    +{preview.length - 50} linhas não exibidas
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={!preview || validRows.length === 0 || importing || !selectedAccount}
              className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {importing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
              ) : (
                `Importar ${validRows.length} transações`
              )}
            </button>
          </div>
        </>
      ) : (
        /* Import result */
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
              {result.errorDetails.map((e, i) => (
                <p key={i} className="text-xs text-red-700">{e}</p>
              ))}
            </div>
          )}

          <button
            onClick={result.inserted > 0 ? onSuccess : onCancel}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg"
          >
            {result.inserted > 0 ? 'Ver transações' : 'Fechar'}
          </button>
        </div>
      )}
    </div>
  )
}
