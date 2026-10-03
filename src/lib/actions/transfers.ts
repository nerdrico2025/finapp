'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { generateImportHash } from '@/lib/import/import-hash'
import {
  detectTransfers,
  findHistoricalPairs,
  matchAccountByName,
  planLinkExisting,
  planLinkToAccount,
  planCompleteOrphan,
  planUnlink,
  TRANSFER_DATE_TOLERANCE_DAYS,
  type DetectionAccount,
  type TransferDetection,
} from '@/lib/import/transfer-detection'
import {
  executeTransferOps,
  toDetectionExisting,
  TX_DETECTION_COLUMNS,
  type TxDetectionRow,
} from '@/lib/import/transfer-writes'
import { addDays } from '@/lib/duplicate-detection'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const entityId = await getActiveEntityId(supabase, user.id)
  return { supabase, userId: user.id, entityId }
}

async function loadAccounts(supabase: SupabaseClient, userId: string, entityId: string | null): Promise<DetectionAccount[]> {
  let q = supabase.from('accounts').select('id, name').eq('user_id', userId).eq('is_active', true)
  if (entityId) q = q.eq('entity_id', entityId)
  const { data } = await q
  return (data ?? []) as DetectionAccount[]
}

const PAGE = 1000

/** Lê todas as páginas (o PostgREST corta em 1000 linhas por resposta). */
async function fetchTransactions(
  supabase: SupabaseClient,
  userId: string,
  entityId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: (q: any) => any,
): Promise<TxDetectionRow[]> {
  const all: TxDetectionRow[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('transactions').select(TX_DETECTION_COLUMNS).eq('user_id', userId)
    if (entityId) q = q.eq('entity_id', entityId)
    const { data, error } = await filter(q).order('id').range(from, from + PAGE - 1)
    if (error || !data) break
    all.push(...(data as unknown as TxDetectionRow[]))
    if (data.length < PAGE) break
  }
  return all
}

function revalidateMoney() {
  revalidatePath('/transactions')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')
}

// ─── Prévia da importação ─────────────────────────────────────────────────────

export interface TransferPreviewInput {
  date: string
  description: string
  amount: number // com sinal
  bankTransactionId?: string | null
}

/**
 * Roda a detecção de transferências para as linhas da prévia de um extrato da
 * conta `accountId`, contra as transações salvas da entidade ativa na janela
 * de datas do arquivo. Deve rodar antes da checagem de duplicatas.
 */
export async function analyzeImportTransfers(
  rows: TransferPreviewInput[],
  accountId: string,
): Promise<(TransferDetection | null)[]> {
  const empty = rows.map(() => null)
  const ctx = await getContext()
  if (!ctx || !accountId) return empty
  const { supabase, userId, entityId } = ctx

  const dates = rows.map(r => r.date).filter(Boolean).sort()
  if (dates.length === 0) return empty

  const [accounts, existing] = await Promise.all([
    loadAccounts(supabase, userId, entityId),
    fetchTransactions(supabase, userId, entityId, q => q
      .gte('date', addDays(dates[0], -TRANSFER_DATE_TOLERANCE_DAYS))
      .lte('date', addDays(dates[dates.length - 1], TRANSFER_DATE_TOLERANCE_DAYS))),
  ])

  return detectTransfers(
    rows.map(r => ({
      accountId,
      date: r.date,
      description: r.description,
      amount: r.amount,
      importHash: r.date ? generateImportHash(userId, Math.abs(r.amount), r.date, r.description) : null,
      bankTransactionId: r.bankTransactionId ?? null,
    })),
    accounts,
    existing.map(toDetectionExisting),
  )
}

// ─── Vínculo manual ───────────────────────────────────────────────────────────

/** Janela de datas para listar possíveis pares no vínculo manual. */
const MANUAL_LINK_WINDOW_DAYS = 5

export interface LinkCandidate {
  id: string
  accountId: string
  date: string
  amount: number
  description: string | null
  /** Mesma data (dentro da tolerância do Sinal A). */
  exact: boolean
}

export async function getTransferLinkCandidates(transactionId: string): Promise<{
  candidates: LinkCandidate[]
  suggestedAccountId: string | null
  error: string | null
}> {
  const ctx = await getContext()
  if (!ctx) return { candidates: [], suggestedAccountId: null, error: 'Não autenticado' }
  const { supabase, userId, entityId } = ctx

  const { data } = await supabase.from('transactions').select(TX_DETECTION_COLUMNS).eq('id', transactionId).eq('user_id', userId).maybeSingle()
  const tx = data as TxDetectionRow | null
  if (!tx || tx.type === 'transfer' || tx.transfer_pair_id) {
    return { candidates: [], suggestedAccountId: null, error: 'Transação não pode ser vinculada' }
  }

  const accounts = await loadAccounts(supabase, userId, entityId)
  const rows = await fetchTransactions(supabase, userId, entityId, q => q
    .eq('type', tx.type === 'expense' ? 'income' : 'expense')
    .is('transfer_pair_id', null)
    .eq('is_mirror', false)
    .neq('account_id', tx.account_id)
    .eq('amount', tx.amount)
    .gte('date', addDays(tx.date, -MANUAL_LINK_WINDOW_DAYS))
    .lte('date', addDays(tx.date, MANUAL_LINK_WINDOW_DAYS)))

  const dist = (d: string) => Math.abs(new Date(d).getTime() - new Date(tx.date).getTime())
  const candidates = rows
    .map(r => ({
      id: r.id,
      accountId: r.account_id,
      date: r.date,
      amount: Number(r.amount),
      description: r.description,
      exact: dist(r.date) <= TRANSFER_DATE_TOLERANCE_DAYS * 86_400_000,
    }))
    .sort((a, b) => dist(a.date) - dist(b.date))

  return {
    candidates,
    suggestedAccountId: matchAccountByName(tx.description ?? '', accounts, tx.account_id),
    error: null,
  }
}

/**
 * "Vincular como transferência": com `counterpartId`, as duas transações
 * salvas formam o par (matched); com `accountId`, a outra perna é criada
 * (pending) e será absorvida quando o extrato daquela conta for importado.
 */
export async function linkAsTransfer(
  transactionId: string,
  target: { counterpartId: string } | { accountId: string },
): Promise<{ error: string | null }> {
  const ctx = await getContext()
  if (!ctx) return { error: 'Não autenticado' }
  const { supabase, userId, entityId } = ctx

  const ids = 'counterpartId' in target ? [transactionId, target.counterpartId] : [transactionId]
  const { data } = await supabase.from('transactions').select(TX_DETECTION_COLUMNS).in('id', ids).eq('user_id', userId)
  const rows = (data ?? []) as unknown as TxDetectionRow[]
  const tx = rows.find(r => r.id === transactionId)
  const free = (r: TxDetectionRow | undefined) =>
    !!r && (r.type === 'income' || r.type === 'expense') && !r.transfer_pair_id && !r.is_mirror &&
    (!entityId || r.entity_id === entityId)
  if (!free(tx)) return { error: 'Transação não pode ser vinculada' }

  let ops
  if ('counterpartId' in target) {
    const other = rows.find(r => r.id === target.counterpartId)
    if (!free(other)) return { error: 'Contraparte não pode ser vinculada' }
    if (other!.type === tx!.type) return { error: 'As duas transações precisam ter sentidos opostos' }
    if (other!.account_id === tx!.account_id) return { error: 'As duas transações precisam ser de contas diferentes' }
    if (Number(other!.amount) !== Number(tx!.amount)) return { error: 'As duas transações precisam ter o mesmo valor' }
    ops = planLinkExisting(
      { id: tx!.id, accountId: tx!.account_id, type: tx!.type },
      { id: other!.id, accountId: other!.account_id, type: other!.type },
      randomUUID(),
      'matched',
    )
  } else {
    if (target.accountId === tx!.account_id) return { error: 'Escolha uma conta diferente da origem' }
    const accounts = await loadAccounts(supabase, userId, entityId)
    if (!accounts.some(a => a.id === target.accountId)) return { error: 'Conta inválida' }
    ops = planLinkToAccount(
      { id: tx!.id, accountId: tx!.account_id, type: tx!.type, date: tx!.date, amount: Number(tx!.amount), description: tx!.description },
      target.accountId,
      randomUUID(),
      'pending',
    )
  }

  const { error } = await executeTransferOps(supabase, userId, entityId, ops)
  if (error) return { error }
  revalidateMoney()
  return { error: null }
}

/** "Desfazer vínculo": as duas pernas voltam a income/expense sem categoria. */
export async function unlinkTransfer(transactionId: string): Promise<{ error: string | null }> {
  const ctx = await getContext()
  if (!ctx) return { error: 'Não autenticado' }
  const { supabase, userId, entityId } = ctx

  const { data: tx } = await supabase.from('transactions').select('transfer_pair_id').eq('id', transactionId).eq('user_id', userId).maybeSingle()
  if (!tx?.transfer_pair_id) return { error: 'Transação não está vinculada' }

  const { data: legs } = await supabase.from('transactions').select('id, is_mirror').eq('transfer_pair_id', tx.transfer_pair_id).eq('user_id', userId)
  if (!legs || legs.length === 0) return { error: 'Par não encontrado' }

  const { error } = await executeTransferOps(
    supabase, userId, entityId,
    planUnlink(legs.map((l: { id: string; is_mirror: boolean }) => ({ id: l.id, isMirror: l.is_mirror }))),
  )
  if (error) return { error }
  revalidateMoney()
  return { error: null }
}

// ─── Revisão retroativa ───────────────────────────────────────────────────────

export interface HistoricalPairView {
  status: 'matched' | 'suggested'
  out: { id: string; accountId: string; date: string; amount: number; description: string | null }
  in: { id: string; accountId: string; date: string; amount: number; description: string | null }
}

/** "Revisar transferências antigas": propõe pares pelos sinais A e B em todo o histórico. */
export async function scanHistoricalTransfers(): Promise<{
  proposals: HistoricalPairView[]
  ambiguousCount: number
  error: string | null
}> {
  const ctx = await getContext()
  if (!ctx) return { proposals: [], ambiguousCount: 0, error: 'Não autenticado' }
  const { supabase, userId, entityId } = ctx

  const [accounts, txs] = await Promise.all([
    loadAccounts(supabase, userId, entityId),
    fetchTransactions(supabase, userId, entityId, q => q
      .in('type', ['income', 'expense'])
      .is('transfer_pair_id', null)
      .eq('is_mirror', false)),
  ])

  const { proposals, ambiguous } = findHistoricalPairs(txs.map(toDetectionExisting), accounts)
  const byId = new Map(txs.map(t => [t.id, t]))
  const view = (id: string) => {
    const t = byId.get(id)!
    return { id: t.id, accountId: t.account_id, date: t.date, amount: Number(t.amount), description: t.description }
  }

  return {
    proposals: proposals
      .map(p => ({ status: p.status, out: view(p.outId), in: view(p.inId) }))
      .sort((a, b) => b.out.date.localeCompare(a.out.date)),
    ambiguousCount: ambiguous.length,
    error: null,
  }
}

/** Aprovação em lote dos pares propostos pela revisão retroativa. */
export async function approveHistoricalTransfers(
  pairs: { outId: string; inId: string }[],
): Promise<{ linked: number; failed: number; error: string | null }> {
  const ctx = await getContext()
  if (!ctx) return { linked: 0, failed: 0, error: 'Não autenticado' }

  let linked = 0
  let failed = 0
  for (const p of pairs) {
    const { error } = await linkAsTransfer(p.outId, { counterpartId: p.inId })
    if (error) failed++
    else linked++
  }
  return { linked, failed, error: null }
}

// ─── Transferências órfãs ─────────────────────────────────────────────────────

export interface OrphanTransfer {
  id: string
  accountId: string
  date: string
  amount: number
  description: string | null
}

const ORPHAN_COLUMNS = 'id, account_id, date, amount, transfer_amount, description, entity_id, type, is_mirror, destination_account_id, transfer_pair_id'

type OrphanRow = {
  id: string
  account_id: string
  date: string
  amount: number
  transfer_amount: number | null
  description: string | null
  entity_id: string | null
  type: string
  is_mirror: boolean
  destination_account_id: string | null
  transfer_pair_id: string | null
}

/**
 * Transferências sem destino e sem par (type='transfer', destination_account_id
 * e transfer_pair_id nulos). As com is_mirror=true ficam de fora: não debitam a
 * origem, então completá-las como principal mudaria o saldo — só são contadas.
 */
export async function getOrphanTransfers(): Promise<{
  orphans: OrphanTransfer[]
  mirrorOrphanCount: number
  error: string | null
}> {
  const ctx = await getContext()
  if (!ctx) return { orphans: [], mirrorOrphanCount: 0, error: 'Não autenticado' }
  const { supabase, userId, entityId } = ctx

  let q = supabase
    .from('transactions')
    .select('id, account_id, date, amount, description, is_mirror')
    .eq('user_id', userId)
    .eq('type', 'transfer')
    .is('destination_account_id', null)
    .is('transfer_pair_id', null)
    .order('date', { ascending: false })
  if (entityId) q = q.eq('entity_id', entityId)
  const { data, error } = await q
  if (error) return { orphans: [], mirrorOrphanCount: 0, error: error.message }

  const rows = (data ?? []) as { id: string; account_id: string; date: string; amount: number; description: string | null; is_mirror: boolean }[]
  return {
    orphans: rows
      .filter(r => !r.is_mirror)
      .map(r => ({ id: r.id, accountId: r.account_id, date: r.date, amount: Number(r.amount), description: r.description })),
    mirrorOrphanCount: rows.filter(r => r.is_mirror).length,
    error: null,
  }
}

/**
 * "Definir conta destino" de uma órfã: preenche destination_account_id, gera
 * o transfer_pair_id e cria o espelho pelo mesmo construtor do createTransfer,
 * com transfer_status='matched'. O saldo da origem não muda.
 */
export async function setTransferDestination(
  transactionId: string,
  destinationAccountId: string,
): Promise<{ error: string | null }> {
  const ctx = await getContext()
  if (!ctx) return { error: 'Não autenticado' }
  const { supabase, userId, entityId } = ctx

  const { data } = await supabase.from('transactions').select(ORPHAN_COLUMNS).eq('id', transactionId).eq('user_id', userId).maybeSingle()
  const tx = data as OrphanRow | null
  if (!tx || (entityId && tx.entity_id !== entityId) ||
      tx.type !== 'transfer' || tx.is_mirror || tx.destination_account_id || tx.transfer_pair_id) {
    return { error: 'Esta transação não é uma transferência sem destino' }
  }
  if (destinationAccountId === tx.account_id) return { error: 'Escolha uma conta diferente da origem' }

  const accounts = await loadAccounts(supabase, userId, entityId)
  if (!accounts.some(a => a.id === destinationAccountId)) return { error: 'Conta inválida' }

  const { error } = await executeTransferOps(
    supabase, userId, entityId,
    planCompleteOrphan(
      {
        id: tx.id,
        accountId: tx.account_id,
        amount: Number(tx.amount),
        transferAmount: tx.transfer_amount === null ? null : Number(tx.transfer_amount),
        date: tx.date,
        description: tx.description,
      },
      destinationAccountId,
      randomUUID(),
    ),
  )
  if (error) return { error }
  revalidateMoney()
  return { error: null }
}
