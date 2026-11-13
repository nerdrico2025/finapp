'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Upload, X, Loader2, AlertTriangle, FileSpreadsheet, FileText, File, ArrowLeftRight,
} from 'lucide-react'
import { importTransactions, findImportDuplicates, findKnownBankTransactionIds, type CSVRow, type DuplicateMatch } from '@/lib/actions/transactions'
import { parsePDFAction, type ParsedRow } from '@/lib/actions/import'
import { analyzeImportTransfers, getAccountHolder } from '@/lib/actions/transfers'
import {
  chooseDestination, chooseCandidate, clearTransfer, importActionOf,
  isTransferRow, isAbsorbed, needsDestination, previewTransferState,
  checkedAfterDetection, checkedAfterTransferEdit, applyTypeChoice, rowKind, absorbedLegDateIfDifferent,
  TRANSFER_STATUS_LABEL, type RowTransferState, type RowKind,
} from '@/lib/import/transfer-preview'
import type { AccountHolder } from '@/lib/import/holder-signal'
import type { TransferSkipped } from '@/lib/actions/transactions'
import { QuickAccountDialog } from '@/components/forms/QuickAccountDialog'
import { ensureDefaultCategoriesForImport, createCategory } from '@/lib/actions/categories'
import { suggestCategory, learnRule } from '@/lib/actions/ai-categorization'
import { aiFailureLabel } from '@/lib/utils/categorization'
import { validateNewCategoryName } from '@/lib/utils/new-category'
import { useActiveEntityId } from '@/contexts/EntityContext'
import { mergeSuggestionIntoRow, getCategoryBadge } from '@/lib/utils/import-suggestions'
import { formatDate, formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { CategorySelect } from '@/components/ui/CategorySelect'
import type { Account, Category } from '@/types'
import {
  detectColumns, isMappingValid, csvToRaw, applyMapping, type ColumnMapping,
} from '@/lib/import/csv'
import { detectSicrediCsv, parseSicrediCsv, checkBalanceChain, type BalanceChainResult } from '@/lib/import/profiles/sicredi'
import { collectBankIds, dropKnownBankIds } from '@/lib/import/known-ids'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditableRow {
  date: string
  description: string
  amount: number        // signed: negative = expense, positive = income
  type: 'income' | 'expense'
  categoryId: string | null
  source: 'rule' | 'ai' | 'keyword' | 'manual' | 'auto' | null
  /** Confiança da sugestão (só relevante para source === 'ai'). Usado para
   *  marcar visualmente sugestões que a IA deu mas com baixa certeza — o
   *  usuário ainda pode editar normalmente, é só um sinalizador de revisão. */
  confidence?: 'high' | 'medium' | 'low' | null
  checked: boolean
  duplicate?: DuplicateMatch | null
  error?: string
  /** Aviso não bloqueante (ex.: sinal e tipo divergentes) — linha vem desmarcada. */
  warning?: string
  raw: string
  /** Id do banco (FITID do OFX, "sicredi:…") — camada 1 de deduplicação, ver findKnownBankTransactionIds. */
  bankTransactionId?: string | null
  /** Sal do import_hash — só o perfil Sicredi preenche (ver generateImportHash). */
  hashSalt?: string | null
  /** Transferência entre contas próprias (detectada ou escolhida na prévia). */
  transfer?: RowTransferState | null
}

interface ImportResult {
  inserted: number
  duplicates: number
  errors: number
  errorDetails: string[]
  transfers: number
  absorbed: number
  transferSkipped: TransferSkipped[]
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

/** Valor da opção "+ Criar conta…" no select de conta destino. */
const NEW_ACCOUNT_OPTION = '__new_account__'

// ─── Parsed → Editable conversion ────────────────────────────────────────────

function parsedToEditable(parsed: ParsedRow[]): EditableRow[] {
  return parsed.map(r => {
    const isBalanceRow = BALANCE_ROW_RE.test(r.description ?? '')
    return {
      date: r.date,
      description: r.description,
      amount: r.amount,
      type: r.type as 'income' | 'expense',
      categoryId: null,
      source: null,
      confidence: null,
      checked: !r.error && !r.warning && !isBalanceRow,
      error: r.error,
      warning: r.warning,
      raw: r.raw ?? '',
      bankTransactionId: r.bankTransactionId ?? null,
      hashSalt: r.hashSalt ?? null,
    }
  })
}

/** Linhas que o usuário pode marcar/desmarcar. Absorvidas não geram linha nova; transferência sem destino não pode ser gravada. */
function isSelectable(r: EditableRow): boolean {
  return !r.error && !isAbsorbed(r.transfer) && !needsDestination(r.transfer)
}

function detectFormat(name: string): FileFormat | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'csv' || ext === 'txt') return 'csv'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  if (ext === 'ofx' || ext === 'qfx') return 'ofx'
  if (ext === 'pdf') return 'pdf'
  return null
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
    const fitid = tag('FITID')
    const dm = dtposted.match(/^(\d{4})(\d{2})(\d{2})/)
    const date = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : ''
    const amount = parseFloat(trnamt.replace(',', '.')) || 0
    rows.push({
      date, description: memo, amount,
      type: amount >= 0 ? 'income' : 'expense',
      raw: block.trim(),
      error: date ? undefined : `Data inválida: ${dtposted}`,
      bankTransactionId: fitid || undefined,
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

export function ImportCSVForm({ accounts: initialAccounts, categories: initialCategories, onSuccess, onCancel }: ImportCSVFormProps) {
  /** Lista local: "+ Criar conta…" acrescenta a conta nova sem recarregar a página. */
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  /** Linha cujo "+ Criar conta…" está aberto. */
  const [creatingAccountFor, setCreatingAccountFor] = useState<number | null>(null)
  /** Selects de conta destino, por linha — focados ao escolher "Transferência". */
  const destRefs = useRef<Record<number, HTMLSelectElement | null>>({})
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
  const [suggestingAi, setSuggestingAi] = useState(false)
  /** Motivo curto quando a IA falhou nesta importação (faixa única na prévia). */
  const [aiUnavailable, setAiUnavailable] = useState<string | null>(null)
  const entityId = useActiveEntityId()
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [checkingTransfers, setCheckingTransfers] = useState(false)
  const [onlyTransfers, setOnlyTransfers] = useState(false)
  const [autoSkippedCount, setAutoSkippedCount] = useState(0)
  /** Conferência da coluna Saldo (só perfil Sicredi) — informativa, não grava nada. */
  const [balanceCheck, setBalanceCheck] = useState<BalanceChainResult | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [allCategories, setAllCategories] = useState<Category[]>(initialCategories)
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
    const validRows = editableRows.filter(isSelectable)
    const allChecked = validRows.every(r => r.checked)
    setEditableRows(rows => rows.map(r => isSelectable(r) ? { ...r, checked: !allChecked } : r))
  }

  /** Edição manual de transferência — prevalece sobre a detecção. */
  function updateTransfer(idx: number, next: RowTransferState) {
    setEditableRows(rows => rows.map((r, i) => {
      if (i !== idx) return r
      // Escolher destino marca a linha; sem destino ou absorvida, desmarca.
      return { ...r, transfer: next, checked: checkedAfterTransferEdit(r, r.transfer, next) }
    }))
  }

  /** Controle de tipo da linha: Receita / Despesa / Transferência. */
  function chooseRowKind(idx: number, choice: RowKind) {
    const row = editableRows[idx]
    if (!row) return
    const patch = applyTypeChoice(row, choice)
    setEditableRows(rows => rows.map((r, i) => {
      if (i !== idx) return r
      const transfer = patch.transfer
      return {
        ...r,
        type: patch.type,
        amount: patch.amount,
        transfer,
        checked: transfer && transfer !== r.transfer ? checkedAfterTransferEdit(r, r.transfer, transfer) : r.checked,
        ...(patch.resetCategory ? { categoryId: null, source: null, confidence: null } : {}),
      }
    }))
    if (choice === 'transfer') setTimeout(() => destRefs.current[idx]?.focus(), 0)
  }

  /** Conta criada pelo "+ Criar conta…": entra na lista e vira o destino da linha. */
  function handleAccountCreated(account: Account) {
    const idx = creatingAccountFor
    setAccounts(list => [...list, account].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
    setCreatingAccountFor(null)
    if (idx !== null && editableRows[idx]) updateTransfer(idx, chooseDestination(editableRows[idx].transfer, account.id))
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
    setAutoSkippedCount(0)
    setBalanceCheck(null)
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
        if (detectSicrediCsv(headers)) {
          const rows = parseSicrediCsv(headers, raw)
          if (!rows.length) { setParseError('Nenhuma transação encontrada no extrato do Sicredi.'); setStep('idle'); return }
          // Sobre o arquivo inteiro, antes da Camada 1 tirar linhas já importadas.
          setBalanceCheck(checkBalanceChain(rows))
          await showPreview(rows)
          return
        }
        const detected = detectColumns(headers)
        const normalizedRaw = raw.map(r => headers.map((_, i) => r[i] ?? ''))
        setRawHeaders(headers); setRawRows(normalizedRaw); setColMap(detected)
        if (isMappingValid(detected)) {
          await showPreview(applyMapping(headers, normalizedRaw, detected))
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
          await showPreview(applyMapping(headers, raw, detected))
        } else {
          console.log('[XLSX] Mapeamento automático falhou. Headers:', headers)
          setStep('mapping')
        }
      }

      else if (fmt === 'ofx') {
        const text = await file.text()
        const rawParsed = parseOFX(text)
        if (!rawParsed.length) { setParseError('Nenhuma transação encontrada no arquivo OFX.'); setStep('idle'); return }
        await showPreview(rawParsed)
      }

      else if (fmt === 'pdf') {
        const fd = new FormData()
        fd.append('file', file)
        const rawParsed = await parsePDFAction(fd)
        if (!rawParsed.length || (rawParsed.length === 1 && rawParsed[0].error)) {
          setParseError(rawParsed[0]?.error ?? 'Nenhuma transação detectada no PDF.')
          setStep('idle'); return
        }
        await showPreview(rawParsed)
      }
    } catch (err) {
      setParseError(`Erro ao processar o arquivo: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
      setStep('idle')
    }
  }

  function applyManualMapping() {
    showPreview(applyMapping(rawHeaders, rawRows, colMap))
  }

  /**
   * Leva as linhas lidas (qualquer formato) para a prévia. Camada 1 — id do
   * banco (FITID do OFX, "sicredi:…"): transações que o banco já identificou
   * como as mesmas de uma importação anterior são puladas direto, sem nem
   * aparecer na pré-visualização (alta confiança, não precisa de confirmação
   * do usuário). Formatos sem id passam direto, sem consulta.
   */
  async function showPreview(rawParsed: ParsedRow[]) {
    const idsToCheck = collectBankIds(rawParsed)
    let knownIds: Set<string> = new Set()
    if (idsToCheck.length > 0) {
      try { knownIds = new Set(await findKnownBankTransactionIds(idsToCheck)) } catch { /* segue sem essa camada se a checagem falhar */ }
    }
    const { rows: filteredParsed, skipped: skippedKnown } = dropKnownBankIds(rawParsed, knownIds)

    if (skippedKnown > 0 && !filteredParsed.length) {
      setParseError(`Todas as ${skippedKnown} transações do arquivo já haviam sido importadas anteriormente (mesmo identificador do banco).`)
      setStep('idle'); return
    }

    setAutoSkippedCount(skippedKnown)
    const parsed = parsedToEditable(filteredParsed)
    setEditableRows(parsed)
    setStep('preview')
    runAiSuggestions(parsed)
    runImportChecks(parsed)
  }

  async function runAiSuggestions(rows: EditableRow[]) {
    const toSuggest = rows.map((r, i) => ({ i, r })).filter(({ r }) => !r.error && (r.checked || !!r.warning))
    setAiUnavailable(null)
    if (toSuggest.length === 0) return
    setSuggestingAi(true)
    try {
      const cats = catsRef.current as Parameters<typeof suggestCategory>[3]
      const BATCH = 5
      for (let b = 0; b < toSuggest.length; b += BATCH) {
        const batch = toSuggest.slice(b, b + BATCH)
        const results = await Promise.all(
          batch.map(({ i: idx, r }) =>
            suggestCategory(r.description, entityId, Math.abs(r.amount), cats, r.type).then(s => ({ idx, s })).catch(() => null)
          )
        )
        const failure = results.find(item => item?.s.ai_failure)?.s.ai_failure
        if (failure) setAiUnavailable(prev => prev ?? aiFailureLabel(failure))
        setEditableRows(prev => {
          const next = [...prev]
          for (const item of results) {
            if (!item) continue
            const { idx, s } = item
            const merged = mergeSuggestionIntoRow(next[idx], s)
            next[idx] = { ...next[idx], categoryId: merged.categoryId, source: merged.source, confidence: merged.confidence }
          }
          return next
        })
      }
    } finally {
      setSuggestingAi(false)
    }
  }

  // Transferências primeiro, duplicatas depois: uma linha absorvida por uma
  // transferência já registrada não deve aparecer como duplicata.
  async function runImportChecks(rows: EditableRow[], accountId = selectedAccount) {
    const withTransfers = await runTransferDetection(rows, accountId)
    await runDuplicateCheck(withTransfers, accountId)
  }

  async function runTransferDetection(rows: EditableRow[], accountId: string): Promise<EditableRow[]> {
    const valid = rows
      .map((r, i) => ({ i, r }))
      .filter(({ r }) => !r.error && r.date)
    if (valid.length === 0 || !accountId) return rows
    setCheckingTransfers(true)
    try {
      const holderPromise: Promise<AccountHolder | null> = getAccountHolder().catch(() => null)
      const dets = await analyzeImportTransfers(
        valid.map(({ r }) => ({
          date: r.date,
          description: r.description,
          amount: r.type === 'expense' ? -Math.abs(r.amount) : Math.abs(r.amount),
          bankTransactionId: r.bankTransactionId ?? null,
          hashSalt: r.hashSalt ?? null,
        })),
        accountId,
      )
      const holder = await holderPromise
      const detected = new Map<number, RowTransferState | null>()
      // Sinais A/B primeiro; o sinal "titular" só nas linhas sem outro resultado.
      valid.forEach(({ i, r }, k) => detected.set(i, previewTransferState(dets[k], r.description, holder)))

      const apply = (list: EditableRow[]) => list.map((r, i) => {
        if (!detected.has(i) || r.transfer?.manual) return r
        const t = detected.get(i) ?? null
        return { ...r, transfer: t, checked: checkedAfterDetection(r, t) }
      })
      setEditableRows(prev => apply(prev))
      return apply(rows)
    } catch {
      // falha na detecção nunca bloqueia a importação
      return rows
    } finally {
      setCheckingTransfers(false)
    }
  }

  // Flag rows that look like duplicates (of saved transactions or earlier
  // rows in this file) and uncheck them by default — the user opts back in.
  async function runDuplicateCheck(rows: EditableRow[], accountId = selectedAccount) {
    const valid = rows
      .map((r, i) => ({ i, r }))
      .filter(({ r }) => !r.error && r.date && !isAbsorbed(r.transfer))
    if (valid.length === 0) return
    setCheckingDuplicates(true)
    try {
      const matches = await findImportDuplicates(
        valid.map(({ r }) => ({
          date: r.date,
          description: r.description,
          amount: r.type === 'expense' ? -Math.abs(r.amount) : Math.abs(r.amount),
          categoryId: r.categoryId,
        })),
        accountId
      )
      setEditableRows(prev => {
        const next = [...prev]
        valid.forEach(({ i: idx }, k) => {
          const m = matches[k]
          if (m) next[idx] = { ...next[idx], duplicate: m, checked: false }
        })
        return next
      })
    } catch {
      // detection failure is silent — never blocks the import
    } finally {
      setCheckingDuplicates(false)
    }
  }

  /**
   * "Nova categoria" do menu da linha. Devolve true quando criou e selecionou
   * a categoria na linha (o menu fecha); false mantém o formulário aberto —
   * a falha já foi avisada por toast.
   */
  async function createCategoryForRow(rowIdx: number, input: { name: string; color: string }): Promise<boolean> {
    const rowType = editableRows[rowIdx]?.type ?? 'expense'
    const invalid = validateNewCategoryName(input.name, rowType, catsRef.current)
    if (invalid) { toast.error(invalid); return false }

    let result: Awaited<ReturnType<typeof createCategory>>
    try {
      result = await createCategory({ name: input.name.trim(), type: rowType, icon: '📦', color: input.color })
    } catch (err) {
      console.error('[ImportCSVForm] createCategory falhou:', err)
      toast.error('Não foi possível criar a categoria. Tente de novo.')
      return false
    }
    if (result.error || !result.data) {
      toast.error(`Não foi possível criar a categoria: ${result.error ?? 'resposta vazia do servidor'}`)
      return false
    }

    // Append direto — sem segunda chamada ao servidor
    const newCategory = result.data
    const updated = [...catsRef.current, newCategory].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    setAllCategories(updated)
    catsRef.current = updated
    updateRow(rowIdx, { categoryId: newCategory.id, source: 'manual', confidence: null })
    return true
  }

  async function handleImport() {
    if (!selectedAccount) return
    setImporting(true)
    // Linhas já registradas via transferência vão junto (desmarcadas) para
    // que a perna existente receba o hash da linha e o par vire matched.
    const toImport = editableRows.filter(r => !r.error && r.date && (r.checked || isAbsorbed(r.transfer)))
    const valid: CSVRow[] = toImport.map(r => {
      const transfer = importActionOf(r.transfer)
      return {
        date: r.date,
        description: r.description,
        amount: r.type === 'expense' ? -Math.abs(r.amount) : Math.abs(r.amount),
        account_id: selectedAccount,
        category_id: transfer ? null : (r.categoryId ?? null),
        category_source: !transfer && r.categoryId ? r.source : null,
        bank_transaction_id: r.bankTransactionId ?? null,
        hash_salt: r.hashSalt ?? null,
        transfer,
      }
    })
    const res = await importTransactions(valid)

    // Learn rules for confirmed rows that have a category — mas não a partir
    // de sugestões de baixa confiança que o usuário não revisou/confirmou:
    // marcar a checkbox de importação não é o mesmo que validar a categoria,
    // e aprender com um palpite fraco poderia propagar um erro para futuras
    // transações parecidas.
    for (const r of toImport) {
      if (importActionOf(r.transfer)) continue
      if (r.categoryId && r.description && r.confidence !== 'low') {
        learnRule(r.description, r.categoryId, entityId).catch(() => {})
      }
    }

    setResult(res)
    setImporting(false)
    setStep('done')
    // Com pares recusados o resumo fica aberto até o usuário ler.
    if (res.inserted + res.transfers + res.absorbed > 0 && res.transferSkipped.length === 0) setTimeout(onSuccess, 1500)
  }

  function reset() {
    setStep('idle'); setFormat(null); setFileName(''); setParseError(null)
    setEditableRows([]); setRawHeaders([]); setRawRows([]); setResult(null)
    setAutoSkippedCount(0)
    setBalanceCheck(null)
    setAiUnavailable(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const checkedRows = editableRows.filter(r => r.checked && !r.error && r.date)
  const errorRows = editableRows.filter(r => r.error)
  const validCount = editableRows.filter(isSelectable).length
  const duplicateCount = editableRows.filter(r => r.duplicate && !r.error).length
  const absorbedCount = editableRows.filter(r => !r.error && isAbsorbed(r.transfer)).length
  const transferCount = editableRows.filter(r => !r.error && isTransferRow(r.transfer)).length
  const ambiguousCount = editableRows.filter(r => !r.error && r.transfer?.status === 'ambiguous').length
  const unassignedCount = editableRows.filter(r => !r.error && needsDestination(r.transfer)).length
  const otherAccounts = accounts.filter(a => a.id !== selectedAccount)
  const accountName = (id: string | null) => accounts.find(a => a.id === id)?.name ?? '—'

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
        {(result.transfers > 0 || result.absorbed > 0) && (
          <p className="text-xs text-sky-700 bg-sky-50 rounded-lg px-3 py-2">
            {result.transfers > 0 && `${result.transfers} transferência${result.transfers > 1 ? 's' : ''} entre contas vinculada${result.transfers > 1 ? 's' : ''}`}
            {result.transfers > 0 && result.absorbed > 0 && ' · '}
            {result.absorbed > 0 && `${result.absorbed} já registrada${result.absorbed > 1 ? 's' : ''} via transferência (par confirmado)`}
          </p>
        )}
        {result.transferSkipped.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold text-amber-800">
              {result.transferSkipped.length} linha{result.transferSkipped.length > 1 ? 's' : ''} marcada{result.transferSkipped.length > 1 ? 's' : ''} como transferência não {result.transferSkipped.length > 1 ? 'foram vinculadas' : 'foi vinculada'} e {result.transferSkipped.length > 1 ? 'entraram' : 'entrou'} como receita/despesa, sem categoria:
            </p>
            {result.transferSkipped.map((t, i) => (
              <p key={i} className="text-xs text-amber-700">{formatDate(t.date)} · {t.description} — {t.reason}</p>
            ))}
          </div>
        )}
        {result.errorDetails.length > 0 && (
          <div className="bg-red-50 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
            {result.errorDetails.map((e, i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
          </div>
        )}
        <button
          onClick={result.inserted + result.transfers + result.absorbed > 0 ? onSuccess : onCancel}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg"
        >
          {result.inserted + result.transfers + result.absorbed > 0 ? 'Ver transações' : 'Fechar'}
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
          onChange={e => {
            const accountId = e.target.value
            setSelectedAccount(accountId)
            if (step === 'preview') {
              // Detecção e duplicatas dependem da conta: refaz do zero.
              const reset = editableRows.map(r => ({
                ...r,
                transfer: null,
                duplicate: null,
                // Remarca o que tinha sido desmarcado automaticamente.
                checked: r.error ? false : (r.duplicate || isAbsorbed(r.transfer) || needsDestination(r.transfer)) ? true : r.checked,
              }))
              setEditableRows(reset)
              runImportChecks(reset, accountId)
            }
          }}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* File drop zone */}
      <div>
        {/* Antes de escolher um arquivo (ou enquanto processa) — área grande e
            tracejada, clicável, faz sentido em destaque. Depois de carregado
            com sucesso, vira uma barra compacta (ver abaixo) pra sobrar mais
            altura pra pré-visualização, que é a parte mais usada da tela. */}
        {(step === 'idle' || step === 'parsing') && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-2">Arquivo</label>
            <div
              onClick={() => step === 'idle' && fileRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-6 text-center transition-colors',
                step === 'idle' ? 'cursor-pointer hover:border-gray-300 hover:bg-gray-50 border-gray-200' : 'border-emerald-300 bg-emerald-50',
              )}
            >
              {step === 'parsing' ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  <p className="text-sm text-gray-500">Processando arquivo{format === 'pdf' ? ' (isso pode levar alguns segundos)' : ''}…</p>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-500">Clique para selecionar o arquivo</p>
                  <p className="text-xs text-gray-400 mt-1">CSV, XLSX, OFX/QFX ou PDF</p>
                </>
              )}
            </div>
          </>
        )}

        {/* Arquivo já carregado — barra compacta de uma linha só. */}
        {fileName && step !== 'parsing' && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <FormatIcon format={format} size="w-4 h-4" />
            <p className="text-sm font-medium text-emerald-700 truncate">{fileName}</p>
            <p className="text-xs text-gray-500 shrink-0 whitespace-nowrap">
              {format?.toUpperCase()}
              {step === 'preview' && ` · ${checkedRows.length} selecionadas${errorRows.length > 0 ? `, ${errorRows.length} com erro` : ''}`}
              {step === 'mapping' && ' · mapeamento necessário'}
            </p>
            <button onClick={reset} className="p-1 text-gray-400 hover:text-gray-600 rounded shrink-0 ml-auto" title="Remover arquivo">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,.ofx,.qfx,.pdf" className="hidden" onChange={handleFile} />

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
            <div className="flex items-center gap-3">
              {transferCount > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyTransfers}
                    onChange={e => setOnlyTransfers(e.target.checked)}
                    className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  Só transferências
                </label>
              )}
              <button
                onClick={toggleAll}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                {checkedRows.length === validCount ? 'Desmarcar todas' : 'Selecionar todas'}
              </button>
            </div>
          </div>

          {suggestingAi && (
            <div className="mb-3 flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <Loader2 className="w-5 h-5 animate-spin text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">IA categorizando automaticamente…</p>
                <p className="text-xs text-amber-600 mt-0.5">Analisando descrições e sugerindo categorias para cada transação</p>
              </div>
            </div>
          )}

          {autoSkippedCount > 0 && (
            <div className="mb-3 flex items-start gap-3 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {autoSkippedCount} transaç{autoSkippedCount > 1 ? 'ões' : 'ão'} ignorada{autoSkippedCount > 1 ? 's' : ''} automaticamente
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Já haviam sido importadas antes (mesmo identificador dado pelo banco) — nem entraram na lista abaixo.
                </p>
              </div>
            </div>
          )}

          {balanceCheck && (balanceCheck.ok ? (
            <p className="mb-3 text-xs text-gray-500">
              Saldo do extrato fecha: abertura {formatCurrency(balanceCheck.openingBalance ?? 0)} → final {formatCurrency(balanceCheck.closingBalance ?? 0)}.
              {' '}Confira se o saldo inicial da conta é {formatCurrency(balanceCheck.openingBalance ?? 0)}.
            </p>
          ) : (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                A coluna Saldo não fecha com os valores lidos
                {balanceCheck.brokenAtIndex !== undefined && ` (linha ${balanceCheck.brokenAtIndex + 2} do arquivo)`}.
              </p>
            </div>
          ))}

          {aiUnavailable && (
            <p className="mb-3 flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              Sugestão automática por IA indisponível ({aiUnavailable}). Usando só regras e palavras-chave.
            </p>
          )}

          {checkingTransfers && (
            <div className="mb-3 flex items-center gap-3 rounded-lg bg-sky-50 border border-sky-200 px-4 py-3">
              <Loader2 className="w-5 h-5 animate-spin text-sky-500 shrink-0" />
              <p className="text-sm font-semibold text-sky-800">Procurando transferências entre suas contas…</p>
            </div>
          )}

          {!checkingTransfers && transferCount > 0 && (
            <div className="mb-3 flex items-start gap-3 rounded-lg bg-sky-50 border border-sky-200 px-4 py-3">
              <ArrowLeftRight className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-sky-800">
                  {transferCount} transferência{transferCount > 1 ? 's' : ''} entre contas
                </p>
                <p className="text-xs text-sky-700 mt-0.5">
                  Não entram como receita nem despesa.
                  {absorbedCount > 0 && ` ${absorbedCount} já registrada${absorbedCount > 1 ? 's' : ''} via transferência — só ${absorbedCount > 1 ? 'serão confirmadas' : 'será confirmada'}, sem linha nova.`}
                  {ambiguousCount > 0 && ` ${ambiguousCount} com mais de um par possível — escolha o par na coluna "Conta destino", ou ${ambiguousCount > 1 ? 'entrarão' : 'entrará'} como receita/despesa.`}
                  {unassignedCount > 0 && ` ${unassignedCount} sem conta destino — escolha a conta na coluna "Conta destino" (ou mude o tipo para receita/despesa); sem isso ${unassignedCount > 1 ? 'não serão importadas' : 'não será importada'}.`}
                </p>
              </div>
            </div>
          )}

          {checkingDuplicates && (
            <div className="mb-3 flex items-center gap-3 rounded-lg bg-orange-50 border border-orange-200 px-4 py-3">
              <Loader2 className="w-5 h-5 animate-spin text-orange-500 shrink-0" />
              <p className="text-sm font-semibold text-orange-800">Verificando possíveis duplicatas…</p>
            </div>
          )}

          {!checkingDuplicates && duplicateCount > 0 && (
            <div className="mb-3 flex items-start gap-3 rounded-lg bg-orange-50 border border-orange-200 px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-orange-800">
                  {duplicateCount} possíve{duplicateCount > 1 ? 'is' : 'l'} duplicata{duplicateCount > 1 ? 's' : ''} desmarcada{duplicateCount > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-orange-600 mt-0.5">
                  Parecem já existir ou estar repetidas no arquivo. Revise e marque apenas as que quiser importar.
                </p>
              </div>
            </div>
          )}

          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col className="w-8" />
                  <col className="w-24" />
                  <col />
                  <col className="w-32" />
                  <col className="w-14" />
                  <col className="w-24" />
                  <col className="w-36" />
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
                    <th className="text-left px-2 py-2 text-gray-500 font-medium">
                      <span className="flex items-center gap-1.5">
                        Categoria
                        {suggestingAi && <Loader2 className="w-3 h-3 animate-spin text-amber-500" />}
                      </span>
                    </th>
                    <th className="text-left px-2 py-2 text-gray-500 font-medium">Fonte</th>
                    <th className="text-left px-2 py-2 text-gray-500 font-medium">Tipo</th>
                    <th className="text-left px-2 py-2 text-gray-500 font-medium">Conta destino</th>
                    <th className="text-right px-2 py-2 text-gray-500 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {editableRows.map((row, i) => (onlyTransfers && !isTransferRow(row.transfer)) ? null : (
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
                          disabled={!isSelectable(row)}
                          title={isAbsorbed(row.transfer) ? 'Já registrada via transferência — o par será confirmado sem criar linha nova' : undefined}
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
                          <>
                            <input
                              value={row.description}
                              onChange={e => updateRow(i, { description: e.target.value })}
                              title={row.description}
                              className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-400 focus:outline-none text-gray-800 py-0.5 transition-colors truncate"
                            />
                            {row.warning && (
                              <span className="flex items-center gap-1 mt-0.5 text-[10px] font-medium text-amber-700" title={row.raw}>
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {row.warning} — confira antes de marcar
                              </span>
                            )}
                            {isAbsorbed(row.transfer) && (() => {
                              const legDate = absorbedLegDateIfDifferent(row.transfer, row.date)
                              return (
                                <span
                                  className="flex items-center gap-1 mt-0.5 text-[10px] font-medium text-sky-700"
                                  title={legDate ? `A transferência pendente estava em ${formatDate(legDate)}; ao importar, ela passa para ${formatDate(row.date)}, a data deste extrato.` : undefined}
                                >
                                  <ArrowLeftRight className="w-3 h-3 shrink-0" />
                                  {legDate
                                    ? `absorve transferência pendente de ${formatDate(legDate).slice(0, 5)}`
                                    : 'já registrada via transferência'}
                                </span>
                              )
                            })()}
                            {row.transfer?.pendingTie && (
                              <span
                                className="flex items-center gap-1 mt-0.5 text-[10px] font-medium text-orange-600"
                                title="Há mais de uma transferência pendente com este valor em datas igualmente próximas — escolha o par na coluna Conta destino, ou a linha entra como receita/despesa."
                              >
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                vários pares pendentes possíveis
                              </span>
                            )}
                            {row.duplicate && (
                              <span
                                className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-medium text-orange-600"
                                title={`${row.duplicate.source === 'file' ? 'Repetida no arquivo' : 'Já registrada'}: ${row.duplicate.reasons.join(' · ')}`}
                              >
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {row.duplicate.source === 'file' ? 'Repetida no arquivo' : 'Possível duplicata'}
                                <span className="text-orange-400 font-normal">· {row.duplicate.reasons.join(', ')}</span>
                              </span>
                            )}
                          </>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-2 py-1.5">
                        {isTransferRow(row.transfer) && !row.error ? (
                          <span className="text-gray-400 italic">Transferência</span>
                        ) : suggestingAi && !row.categoryId && !row.error ? (
                          <div className="h-4 w-28 bg-amber-100 rounded animate-pulse" />
                        ) : row.error ? null : (
                          <CategorySelect
                            categories={allCategories.filter(c => c.type === row.type)}
                            value={row.categoryId ?? ''}
                            onChange={val => updateRow(i, { categoryId: val || null, source: val ? 'manual' : null, confidence: null })}
                            onCreate={input => createCategoryForRow(i, input)}
                            createType={row.type}
                            placeholder="— categoria —"
                            compact
                          />
                        )}
                      </td>

                      {/* Source badge */}
                      <td className="px-2 py-1.5">
                        {getCategoryBadge(row) === 'auto' && (
                          <span className="inline-block px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-medium whitespace-nowrap">
                            ✓ Auto
                          </span>
                        )}
                        {getCategoryBadge(row) === 'rule' && (
                          <span className="inline-block px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-medium whitespace-nowrap">
                            Regra
                          </span>
                        )}
                        {getCategoryBadge(row) === 'ai_low' && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-medium whitespace-nowrap"
                            title="A IA não tem certeza dessa categoria — confira antes de importar"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            Sugerido — revisar
                          </span>
                        )}
                        {getCategoryBadge(row) === 'ai' && (
                          <span className="inline-block px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 text-[10px] font-medium whitespace-nowrap">
                            IA
                          </span>
                        )}
                        {getCategoryBadge(row) === 'keyword' && (
                          <span className="inline-block px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-medium whitespace-nowrap">
                            Sugestão
                          </span>
                        )}
                        {getCategoryBadge(row) === 'manual' && (
                          <span className="inline-block px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium whitespace-nowrap">
                            Manual
                          </span>
                        )}
                      </td>

                      {/* Tipo: Receita / Despesa / Transferência */}
                      <td className="px-2 py-1.5">
                        <select
                          value={rowKind(row)}
                          onChange={e => chooseRowKind(i, e.target.value as RowKind)}
                          disabled={!!row.error}
                          title={isTransferRow(row.transfer) ? (row.amount < 0 ? 'Transferência de saída' : 'Transferência de entrada') : undefined}
                          className={cn(
                            'w-full px-1 py-0.5 rounded-full text-xs font-medium text-center border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:cursor-default',
                            isTransferRow(row.transfer)
                              ? 'bg-sky-100 text-sky-700'
                              : row.type === 'income'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700',
                          )}
                        >
                          <option value="income">Receita</option>
                          <option value="expense">Despesa</option>
                          <option value="transfer">{row.amount < 0 ? 'Transf. ↗' : 'Transf. ↙'}</option>
                        </select>
                      </td>

                      {/* Destination account / transfer status */}
                      <td className="px-2 py-1.5">
                        {!row.error && (
                          <div className="space-y-0.5">
                            <select
                              ref={el => { destRefs.current[i] = el }}
                              value={isTransferRow(row.transfer) ? (row.transfer.destinationAccountId ?? '') : ''}
                              onChange={e => {
                                const v = e.target.value
                                if (v === NEW_ACCOUNT_OPTION) { setCreatingAccountFor(i); return }
                                updateTransfer(i, v ? chooseDestination(row.transfer, v) : clearTransfer(row.transfer))
                              }}
                              className={cn(
                                'w-full bg-transparent border-b hover:border-gray-200 focus:border-sky-400 focus:outline-none text-gray-700 py-0.5 truncate',
                                needsDestination(row.transfer) ? 'border-amber-300' : 'border-transparent',
                              )}
                            >
                              <option value="">{needsDestination(row.transfer) ? 'Escolher conta…' : '—'}</option>
                              {otherAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                              <option value={NEW_ACCOUNT_OPTION}>+ Criar conta…</option>
                            </select>
                            {row.transfer?.status === 'ambiguous' && (
                              <select
                                value=""
                                onChange={e => {
                                  const c = row.transfer!.candidates.find(c => c.kind !== 'row' && c.id === e.target.value)
                                  if (c) updateTransfer(i, chooseCandidate(row.transfer!, c))
                                }}
                                className="w-full rounded border border-orange-200 bg-orange-50 text-orange-800 text-[10px] py-0.5"
                              >
                                <option value="">Escolher par…</option>
                                {row.transfer.candidates
                                  .filter(c => !row.transfer!.destinationAccountId ||
                                    (c.kind === 'leg' ? c.counterpartAccountId : c.accountId) === row.transfer!.destinationAccountId)
                                  .map(c => c.kind === 'row' ? null : (
                                    <option key={c.id} value={c.id}>
                                      {accountName(c.kind === 'leg' ? c.counterpartAccountId : c.accountId)} · {formatDate(c.date)} · {c.description ?? 'sem descrição'}
                                    </option>
                                  ))}
                              </select>
                            )}
                            {isTransferRow(row.transfer) && (
                              <div className="flex flex-wrap gap-0.5">
                                {row.transfer.holder && (
                                  <span
                                    title="A descrição cita o seu nome completo (Configurações › Perfil) — parece transferência entre contas suas"
                                    className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap bg-violet-50 text-violet-700"
                                  >
                                    Titular
                                  </span>
                                )}
                                <TransferBadge status={row.transfer.status} />
                              </div>
                            )}
                          </div>
                        )}
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

        </div>
      )}

      {creatingAccountFor !== null && (
        <QuickAccountDialog onCreated={handleAccountCreated} onClose={() => setCreatingAccountFor(null)} />
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
        {step === 'preview' && (
          <button
            onClick={handleImport}
            disabled={(checkedRows.length === 0 && absorbedCount === 0) || !selectedAccount || importing}
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

function FormatIcon({ format, size = 'w-8 h-8' }: { format: FileFormat | null; size?: string }) {
  if (format === 'xlsx') return <FileSpreadsheet className={cn(size, 'text-emerald-600 shrink-0')} />
  if (format === 'pdf') return <FileText className={cn(size, 'text-red-500 shrink-0')} />
  if (format === 'ofx') return <File className={cn(size, 'text-blue-500 shrink-0')} />
  return <File className={cn(size, 'text-emerald-500 shrink-0')} />
}

// ─── Transfer badge ───────────────────────────────────────────────────────────

const TRANSFER_BADGE_CLASS: Record<keyof typeof TRANSFER_STATUS_LABEL, string> = {
  matched: 'bg-emerald-50 text-emerald-700',
  suggested: 'bg-sky-50 text-sky-700',
  pending: 'bg-amber-50 text-amber-700',
  ambiguous: 'bg-orange-50 text-orange-700',
  unassigned: 'bg-amber-50 text-amber-700',
}

const TRANSFER_BADGE_TITLE: Record<keyof typeof TRANSFER_STATUS_LABEL, string> = {
  matched: 'Par confirmado com a outra conta',
  suggested: 'Mesmo valor e data em outra conta — confira antes de importar',
  pending: 'O par será criado; a outra conta confirma quando o extrato dela for importado',
  ambiguous: 'Mais de um par possível — escolha qual',
  unassigned: 'Transferência sem conta destino — escolha a conta para importar a linha',
}

function TransferBadge({ status }: { status: RowTransferState['status'] }) {
  if (status === 'none') return null
  return (
    <span
      title={TRANSFER_BADGE_TITLE[status]}
      className={cn('inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap', TRANSFER_BADGE_CLASS[status])}
    >
      {TRANSFER_STATUS_LABEL[status]}
    </span>
  )
}
