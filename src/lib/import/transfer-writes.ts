import type { SupabaseClient } from '@supabase/supabase-js'
import {
  planAbsorb,
  planConvert,
  planCreatePair,
  sameMovement,
  type DetectionExisting,
  type PlannedOp,
  type PlanRow,
  type TxPatch,
} from './transfer-detection'

type Snapshot = { id: string } & Record<string, unknown>

/**
 * Executa as escritas planejadas por transfer-detection, na ordem. Sem
 * transação no PostgREST, então guarda o estado anterior das linhas
 * atualizadas e desfaz tudo (deleta inserts, restaura updates) se uma etapa
 * falhar. A trigger de saldo recalcula a partir do zero a cada escrita, então
 * o saldo final só depende do estado final das linhas.
 */
export async function executeTransferOps(
  supabase: SupabaseClient,
  userId: string,
  entityId: string | null,
  ops: PlannedOp[],
): Promise<{ error: string | null; insertedIds: string[] }> {
  const insertedIds: string[] = []
  const snapshots: Snapshot[] = []

  const snapshot = async (column: 'id' | 'transfer_pair_id', value: string, patch: TxPatch) => {
    const cols = ['id', ...Object.keys(patch)].join(', ')
    const { data } = await supabase.from('transactions').select(cols).eq(column, value).eq('user_id', userId)
    snapshots.push(...((data ?? []) as unknown as Snapshot[]))
  }

  const rollback = async () => {
    if (insertedIds.length > 0) {
      await supabase.from('transactions').delete().in('id', insertedIds).eq('user_id', userId)
    }
    for (const { id, ...prev } of snapshots.reverse()) {
      await supabase.from('transactions').update(prev).eq('id', id).eq('user_id', userId)
    }
  }

  for (const op of ops) {
    let error: { message: string } | null = null
    if (op.op === 'insert') {
      const res = await supabase
        .from('transactions')
        .insert({ ...op.row, user_id: userId, entity_id: entityId, status: 'completed' })
        .select('id')
        .single()
      error = res.error
      if (res.data) insertedIds.push(res.data.id)
    } else if (op.op === 'update') {
      await snapshot('id', op.id, op.patch)
      error = (await supabase.from('transactions').update(op.patch).eq('id', op.id).eq('user_id', userId)).error
    } else {
      await snapshot('transfer_pair_id', op.pairId, op.patch)
      error = (await supabase.from('transactions').update(op.patch).eq('transfer_pair_id', op.pairId).eq('user_id', userId)).error
    }

    if (error) {
      await rollback()
      return { error: error.message, insertedIds: [] }
    }
  }

  return { error: null, insertedIds }
}

// ─── Importação ───────────────────────────────────────────────────────────────

/** Ação de transferência escolhida na prévia, revalidada no servidor. */
export type ImportTransferAction =
  | { kind: 'absorb'; legId: string }
  | { kind: 'convert'; existingId: string }
  | { kind: 'createPair'; counterpartAccountId: string }

export const TX_DETECTION_COLUMNS =
  'id, account_id, date, amount, type, description, transfer_pair_id, is_mirror, destination_account_id, import_hash, bank_transaction_id, entity_id'

export type TxDetectionRow = {
  id: string
  account_id: string
  date: string
  amount: number
  type: 'income' | 'expense' | 'transfer'
  description: string | null
  transfer_pair_id: string | null
  is_mirror: boolean
  destination_account_id: string | null
  import_hash: string | null
  bank_transaction_id: string | null
  entity_id: string | null
}

export function toDetectionExisting(t: TxDetectionRow): DetectionExisting {
  return {
    id: t.id,
    accountId: t.account_id,
    date: t.date,
    amount: Number(t.amount),
    type: t.type,
    description: t.description,
    transferPairId: t.transfer_pair_id,
    isMirror: t.is_mirror,
    destinationAccountId: t.destination_account_id,
    importHash: t.import_hash,
    bankTransactionId: t.bank_transaction_id,
  }
}

async function loadTx(supabase: SupabaseClient, userId: string, id: string): Promise<TxDetectionRow | null> {
  const { data } = await supabase.from('transactions').select(TX_DETECTION_COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle()
  return (data as TxDetectionRow | null) ?? null
}

async function accountInEntity(supabase: SupabaseClient, userId: string, entityId: string | null, accountId: string) {
  let q = supabase.from('accounts').select('id').eq('id', accountId).eq('user_id', userId).eq('is_active', true)
  if (entityId) q = q.eq('entity_id', entityId)
  const { data } = await q.maybeSingle()
  return !!data
}

/**
 * Grava uma linha importada como perna de transferência. Revalida a ação
 * contra o estado atual do banco (a prévia pode estar velha) e devolve
 * `skipped` quando a contraparte não serve mais — aí o chamador cai no
 * fluxo normal de income/expense.
 */
export async function applyImportTransfer(
  supabase: SupabaseClient,
  userId: string,
  entityId: string | null,
  row: PlanRow,
  action: ImportTransferAction,
  newPairId: () => string,
): Promise<{ result: 'linked' | 'absorbed' | 'skipped'; error: string | null }> {
  const isOutflow = row.amount < 0
  const sameEntity = (t: TxDetectionRow) => !entityId || t.entity_id === entityId

  if (action.kind === 'absorb') {
    const legRow = await loadTx(supabase, userId, action.legId)
    const ok = !!legRow && sameEntity(legRow) &&
      legRow.type === 'transfer' && !!legRow.transfer_pair_id &&
      legRow.account_id === row.accountId &&
      !legRow.import_hash && !legRow.bank_transaction_id &&
      legRow.is_mirror === !isOutflow &&
      sameMovement(row.date, row.amount, legRow.date, Number(legRow.amount))
    if (!ok) return { result: 'skipped', error: null }
    const { error } = await executeTransferOps(supabase, userId, entityId, planAbsorb(row, legRow!.id, legRow!.transfer_pair_id!))
    return { result: error ? 'skipped' : 'absorbed', error }
  }

  if (action.kind === 'convert') {
    const e = await loadTx(supabase, userId, action.existingId)
    const ok = !!e && sameEntity(e) &&
      e.type === (isOutflow ? 'income' : 'expense') &&
      !e.transfer_pair_id && !e.is_mirror &&
      e.account_id !== row.accountId &&
      sameMovement(row.date, row.amount, e.date, Number(e.amount))
    if (!ok) return { result: 'skipped', error: null }
    const { error } = await executeTransferOps(
      supabase, userId, entityId,
      planConvert(row, { id: e!.id, accountId: e!.account_id, type: e!.type }, newPairId(), 'matched'),
    )
    return { result: error ? 'skipped' : 'linked', error }
  }

  if (action.counterpartAccountId === row.accountId ||
      !(await accountInEntity(supabase, userId, entityId, action.counterpartAccountId))) {
    return { result: 'skipped', error: null }
  }
  const { error } = await executeTransferOps(
    supabase, userId, entityId,
    planCreatePair(row, action.counterpartAccountId, newPairId(), 'pending'),
  )
  return { result: error ? 'skipped' : 'linked', error }
}
