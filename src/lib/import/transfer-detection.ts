/**
 * Detecção de transferências entre contas próprias na importação de extratos.
 *
 * Módulo puro (sem Supabase): recebe as linhas da prévia, as contas da entidade
 * ativa e as transações já salvas, e decide por linha se é uma transferência.
 * Também planeja as escritas (inserts/updates) que materializam o par no modelo
 * existente — principal (is_mirror=false, account_id = origem,
 * destination_account_id = destino) + espelho (is_mirror=true, conta destino),
 * ligados por transfer_pair_id. Só a principal mexe no saldo (ver trigger
 * recalculate_account_balance), então nenhum plano pode deixar as duas pernas
 * com is_mirror=false.
 *
 * Sinais:
 *   A (par espelhado): mesmo valor absoluto, sinais opostos, mesma data
 *     (± TRANSFER_DATE_TOLERANCE_DAYS), contas diferentes.
 *   B (nome da conta): a descrição normalizada contém o nome completo de outra
 *     conta da entidade, como palavra(s) inteira(s). O maior nome vence.
 */

import type { TransferStatus } from '@/types'

export const TRANSFER_DATE_TOLERANCE_DAYS = 0

export type TransferDetectionStatus = 'matched' | 'suggested' | 'pending' | 'ambiguous' | 'none'

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface DetectionAccount {
  id: string
  name: string
}

/** Linha da prévia (ou de um lote multi-conta). */
export interface DetectionRow {
  accountId: string
  date: string
  description: string
  /** Com sinal: negativo = saída da conta, positivo = entrada. */
  amount: number
  importHash?: string | null
  bankTransactionId?: string | null
}

/** Transação já salva, no formato relevante para a detecção. */
export interface DetectionExisting {
  id: string
  accountId: string
  date: string
  /** Valor absoluto, como gravado em transactions.amount. */
  amount: number
  type: 'income' | 'expense' | 'transfer'
  description: string | null
  transferPairId: string | null
  isMirror: boolean
  destinationAccountId: string | null
  importHash: string | null
  bankTransactionId?: string | null
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

export type TransferCandidate =
  /** income/expense salva e fora de par — vira uma perna por conversão. */
  | { kind: 'existing'; id: string; accountId: string; date: string; amount: number; description: string | null }
  /** Perna de um par já salvo, nesta mesma conta, ainda sem extrato — a linha é absorvida por ela. */
  | { kind: 'leg'; id: string; accountId: string; counterpartAccountId: string | null; date: string; amount: number; description: string | null }
  /** Outra linha do mesmo lote, em outra conta. */
  | { kind: 'row'; rowIndex: number; accountId: string; date: string; amount: number; description: string }

export type TransferAction =
  | { kind: 'absorb'; legId: string }
  | { kind: 'convert'; existingId: string }
  | { kind: 'pairRow'; rowIndex: number }
  | { kind: 'createPair'; counterpartAccountId: string }

export interface TransferDetection {
  status: TransferDetectionStatus
  /** Ação a executar se o usuário mantiver a detecção. null em 'none' e 'ambiguous'. */
  action: TransferAction | null
  candidates: TransferCandidate[]
  /** Conta da outra perna (destino da saída ou origem da entrada). */
  destinationAccountId: string | null
  /** A movimentação já existe via transferência — a linha não gera registro novo. */
  alreadyRecorded: boolean
  /** Conta encontrada pelo Sinal B, se houver. */
  nameMatchAccountId: string | null
}

const NONE: TransferDetection = {
  status: 'none',
  action: null,
  candidates: [],
  destinationAccountId: null,
  alreadyRecorded: false,
  nameMatchAccountId: null,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minúsculas, sem acento, só letras/dígitos separados por um espaço. */
export function normalizeText(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function cents(n: number): number {
  return Math.round(Math.abs(n) * 100)
}

function dayDiff(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return Math.abs(Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 86_400_000
}

export function sameMovement(dateA: string, amountA: number, dateB: string, amountB: number): boolean {
  return cents(amountA) === cents(amountB) && dayDiff(dateA, dateB) <= TRANSFER_DATE_TOLERANCE_DAYS
}

/**
 * Sinal B: id da conta da entidade cujo nome completo aparece na descrição.
 * Os nomes são testados do maior para o menor e cada ocorrência encontrada é
 * consumida — assim "Cartão BTG" vence "BTG", e o "BTG" de dentro de
 * "Cartão BTG" não casa sozinho. A conta sendo importada é ignorada (mas
 * também consome o trecho, para não liberar um nome menor contido nele).
 */
export function matchAccountByName(
  description: string,
  accounts: DetectionAccount[],
  ownAccountId: string,
): string | null {
  let text = ` ${normalizeText(description)} `
  const byLength = accounts
    .map(a => ({ id: a.id, name: normalizeText(a.name) }))
    .filter(a => a.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length)

  for (const acc of byLength) {
    const needle = ` ${acc.name} `
    if (!text.includes(needle)) continue
    if (acc.id !== ownAccountId) return acc.id
    text = text.split(needle).join('  ')
  }
  return null
}

/** Direção de uma perna de par em relação à própria conta. */
function legIsOutflow(leg: DetectionExisting): boolean {
  return !leg.isMirror
}

// ─── Detecção ─────────────────────────────────────────────────────────────────

/**
 * Classifica cada linha. Procura a contraparte nas transações salvas e nas
 * outras linhas do lote, para que a ordem de importação não mude o resultado.
 * Transações que já pertencem a um par só servem para absorção (a perna da
 * própria conta ainda sem extrato); nunca são candidatas a conversão.
 */
export function detectTransfers(
  rows: DetectionRow[],
  accounts: DetectionAccount[],
  existing: DetectionExisting[],
): TransferDetection[] {
  const accountIds = new Set(accounts.map(a => a.id))

  const result = rows.map((row, i): TransferDetection => {
    if (!row.date || !Number.isFinite(row.amount) || row.amount === 0) return NONE
    const isOutflow = row.amount < 0

    // Reimportação da mesma linha (mesma conta + mesmo hash/FITID): não é
    // transferência nova — a deduplicação cuida dela.
    const selfDuplicate = existing.some(e =>
      e.accountId === row.accountId && (
        (!!row.importHash && e.importHash === row.importHash) ||
        (!!row.bankTransactionId && e.bankTransactionId === row.bankTransactionId)
      ),
    )
    if (selfDuplicate) return NONE

    const nameMatch = matchAccountByName(row.description, accounts, row.accountId)

    // 1. Absorção: perna de par já salva nesta conta, sem extrato, mesma direção.
    const legs = existing.filter(e =>
      e.type === 'transfer' &&
      !!e.transferPairId &&
      e.accountId === row.accountId &&
      !e.importHash &&
      !e.bankTransactionId &&
      legIsOutflow(e) === isOutflow &&
      sameMovement(row.date, row.amount, e.date, e.amount),
    )
    if (legs.length > 0) {
      const legCandidates: TransferCandidate[] = legs.map(l => ({
        kind: 'leg', id: l.id, accountId: l.accountId, counterpartAccountId: l.destinationAccountId,
        date: l.date, amount: l.amount, description: l.description,
      }))
      const preferred = legs.length === 1
        ? legs
        : legs.filter(l => nameMatch && l.destinationAccountId === nameMatch)
      if (preferred.length === 1) {
        return {
          status: 'matched',
          action: { kind: 'absorb', legId: preferred[0].id },
          candidates: legCandidates,
          destinationAccountId: preferred[0].destinationAccountId,
          alreadyRecorded: true,
          nameMatchAccountId: nameMatch,
        }
      }
      return {
        status: 'ambiguous', action: null, candidates: legCandidates,
        destinationAccountId: nameMatch, alreadyRecorded: false, nameMatchAccountId: nameMatch,
      }
    }

    // 2. Sinal A: income/expense fora de par em outra conta, direção oposta.
    const wantedType = isOutflow ? 'income' : 'expense'
    const aCandidates: TransferCandidate[] = [
      ...existing
        .filter(e =>
          e.type === wantedType &&
          !e.transferPairId &&
          !e.isMirror &&
          e.accountId !== row.accountId &&
          accountIds.has(e.accountId) &&
          sameMovement(row.date, row.amount, e.date, e.amount),
        )
        .map((e): TransferCandidate => ({
          kind: 'existing', id: e.id, accountId: e.accountId, date: e.date, amount: e.amount, description: e.description,
        })),
      ...rows
        .map((r, j) => ({ r, j }))
        .filter(({ r, j }) =>
          j !== i &&
          r.accountId !== row.accountId &&
          accountIds.has(r.accountId) &&
          Math.sign(r.amount) === -Math.sign(row.amount) &&
          sameMovement(row.date, row.amount, r.date, r.amount),
        )
        .map(({ r, j }): TransferCandidate => ({
          kind: 'row', rowIndex: j, accountId: r.accountId, date: r.date, amount: Math.abs(r.amount), description: r.description,
        })),
    ]

    const actionFor = (c: TransferCandidate): TransferAction =>
      c.kind === 'row' ? { kind: 'pairRow', rowIndex: c.rowIndex } : { kind: 'convert', existingId: c.id }

    if (nameMatch) {
      const inNamed = aCandidates.filter(c => c.accountId === nameMatch)
      if (inNamed.length === 1) {
        return {
          status: 'matched', action: actionFor(inNamed[0]), candidates: inNamed,
          destinationAccountId: nameMatch, alreadyRecorded: false, nameMatchAccountId: nameMatch,
        }
      }
      if (inNamed.length > 1) {
        return {
          status: 'ambiguous', action: null, candidates: inNamed,
          destinationAccountId: nameMatch, alreadyRecorded: false, nameMatchAccountId: nameMatch,
        }
      }
      return {
        status: 'pending', action: { kind: 'createPair', counterpartAccountId: nameMatch }, candidates: [],
        destinationAccountId: nameMatch, alreadyRecorded: false, nameMatchAccountId: nameMatch,
      }
    }

    if (aCandidates.length === 1) {
      return {
        status: 'suggested', action: actionFor(aCandidates[0]), candidates: aCandidates,
        destinationAccountId: aCandidates[0].accountId, alreadyRecorded: false, nameMatchAccountId: null,
      }
    }
    if (aCandidates.length > 1) {
      return {
        status: 'ambiguous', action: null, candidates: aCandidates,
        destinationAccountId: null, alreadyRecorded: false, nameMatchAccountId: null,
      }
    }
    return NONE
  })

  return resolveConflicts(result)
}

/**
 * Uma mesma contraparte não pode ser reivindicada por duas linhas, e pares
 * dentro do lote precisam ser mútuos. Quem disputa vira 'ambiguous' — nunca
 * pareamos sozinhos quando há mais de uma leitura possível.
 */
function resolveConflicts(dets: TransferDetection[]): TransferDetection[] {
  const claims = new Map<string, number[]>()
  dets.forEach((d, i) => {
    const a = d.action
    if (!a || (a.kind !== 'absorb' && a.kind !== 'convert')) return
    const key = a.kind === 'absorb' ? a.legId : a.existingId
    claims.set(key, [...(claims.get(key) ?? []), i])
  })

  const out = dets.map(d => ({ ...d }))
  const toAmbiguous = (i: number) => {
    out[i] = { ...out[i], status: 'ambiguous', action: null, alreadyRecorded: false }
  }

  claims.forEach(idxs => { if (idxs.length > 1) idxs.forEach(toAmbiguous) })

  dets.forEach((d, i) => {
    if (d.action?.kind !== 'pairRow') return
    const j = d.action.rowIndex
    const back = dets[j]?.action
    if (back?.kind !== 'pairRow' || back.rowIndex !== i) {
      toAmbiguous(i)
      return
    }
    // Par mútuo: vale o status mais forte das duas pontas.
    if (i < j && (d.status === 'matched' || dets[j].status === 'matched')) {
      out[i] = { ...out[i], status: 'matched' }
      out[j] = { ...out[j], status: 'matched' }
    }
  })

  return out
}

// ─── Planejamento das escritas ────────────────────────────────────────────────

export interface TxDraft {
  account_id: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  date: string
  description: string | null
  destination_account_id: string | null
  transfer_pair_id: string | null
  is_mirror: boolean
  transfer_status: TransferStatus | null
  import_hash: string | null
  bank_transaction_id: string | null
  category_id: string | null
  category_source: null
}

export type TxPatch = Partial<TxDraft>

export type PlannedOp =
  | { op: 'update'; id: string; patch: TxPatch }
  | { op: 'updatePair'; pairId: string; patch: TxPatch }
  | { op: 'insert'; row: TxDraft }
  | { op: 'delete'; id: string }

/** Linha importada já normalizada para o planejamento. */
export interface PlanRow {
  accountId: string
  date: string
  description: string
  amount: number // com sinal
  importHash: string | null
  bankTransactionId: string | null
}

/** Mínimo de uma transação salva necessário para convertê-la em perna. */
export interface PlanExisting {
  id: string
  accountId: string
  type: 'income' | 'expense' | 'transfer'
}

function leg(
  base: { accountId: string; date: string; description: string | null; amount: number },
  counterpartAccountId: string,
  pairId: string,
  isMirror: boolean,
  status: TransferStatus,
  importHash: string | null,
  bankTransactionId: string | null,
): TxDraft {
  return {
    account_id: base.accountId,
    type: 'transfer',
    amount: Math.abs(base.amount),
    date: base.date,
    description: base.description,
    destination_account_id: counterpartAccountId,
    transfer_pair_id: pairId,
    is_mirror: isMirror,
    transfer_status: status,
    import_hash: importHash,
    bank_transaction_id: bankTransactionId,
    category_id: null,
    category_source: null,
  }
}

function legPatch(counterpartAccountId: string, pairId: string, isMirror: boolean, status: TransferStatus): TxPatch {
  return {
    type: 'transfer',
    destination_account_id: counterpartAccountId,
    transfer_pair_id: pairId,
    is_mirror: isMirror,
    transfer_status: status,
    category_id: null,
    category_source: null,
  }
}

/** A linha já existe como perna sem extrato: grava o hash/FITID nela e confirma o par. */
export function planAbsorb(row: PlanRow, legId: string, pairId: string): PlannedOp[] {
  return [
    { op: 'update', id: legId, patch: { import_hash: row.importHash, bank_transaction_id: row.bankTransactionId } },
    { op: 'updatePair', pairId, patch: { transfer_status: 'matched' } },
  ]
}

/**
 * Converte a income/expense salva E (conta X) e a linha L (conta Y) em par.
 * A saída vira a principal e a entrada vira espelho, então o saldo de X fica
 * igual: saída de X continua -valor (agora como principal), entrada em X
 * continua +valor (agora vinda da principal em Y).
 */
export function planConvert(row: PlanRow, e: PlanExisting, pairId: string, status: TransferStatus = 'matched'): PlannedOp[] {
  const rowIsOutflow = row.amount < 0
  return [
    { op: 'update', id: e.id, patch: legPatch(row.accountId, pairId, rowIsOutflow, status) },
    { op: 'insert', row: leg(row, e.accountId, pairId, !rowIsOutflow, status, row.importHash, row.bankTransactionId) },
  ]
}

/**
 * Cria o par completo a partir de uma linha cuja contraparte ainda não existe
 * (destino conhecido pelo Sinal B ou escolhido na prévia). A perna da outra
 * conta nasce sem import_hash e será absorvida quando o extrato dela chegar.
 */
export function planCreatePair(row: PlanRow, counterpartAccountId: string, pairId: string, status: TransferStatus = 'pending'): PlannedOp[] {
  const rowIsOutflow = row.amount < 0
  const other = { accountId: counterpartAccountId, date: row.date, description: row.description, amount: row.amount }
  return [
    { op: 'insert', row: leg(row, counterpartAccountId, pairId, !rowIsOutflow, status, row.importHash, row.bankTransactionId) },
    { op: 'insert', row: leg(other, row.accountId, pairId, rowIsOutflow, status, null, null) },
  ]
}

/** Duas linhas do mesmo lote, em contas diferentes, formam o par. */
export function planPairRows(a: PlanRow, b: PlanRow, pairId: string, status: TransferStatus = 'matched'): PlannedOp[] {
  const [out, inn] = a.amount < 0 ? [a, b] : [b, a]
  return [
    { op: 'insert', row: leg(out, inn.accountId, pairId, false, status, out.importHash, out.bankTransactionId) },
    { op: 'insert', row: leg(inn, out.accountId, pairId, true, status, inn.importHash, inn.bankTransactionId) },
  ]
}

/** Vínculo manual/retroativo entre duas income/expense já salvas. */
export function planLinkExisting(a: PlanExisting, b: PlanExisting, pairId: string, status: TransferStatus = 'matched'): PlannedOp[] {
  const [out, inn] = a.type === 'expense' ? [a, b] : [b, a]
  return [
    { op: 'update', id: out.id, patch: legPatch(inn.accountId, pairId, false, status) },
    { op: 'update', id: inn.id, patch: legPatch(out.accountId, pairId, true, status) },
  ]
}

/**
 * Vínculo manual de uma income/expense salva a uma conta sem contraparte
 * registrada: E vira uma perna e a outra nasce sem import_hash (pending),
 * pronta para ser absorvida pelo extrato da outra conta.
 */
export function planLinkToAccount(
  e: PlanExisting & { date: string; amount: number; description: string | null },
  counterpartAccountId: string,
  pairId: string,
  status: TransferStatus = 'pending',
): PlannedOp[] {
  const eIsOutflow = e.type === 'expense'
  const other = { accountId: counterpartAccountId, date: e.date, description: e.description, amount: e.amount }
  return [
    { op: 'update', id: e.id, patch: legPatch(counterpartAccountId, pairId, !eIsOutflow, status) },
    { op: 'insert', row: leg(other, e.accountId, pairId, eIsOutflow, status, null, null) },
  ]
}

/** Lado de origem de uma transferência, como o createTransfer o recebe. */
export interface TransferPrimary {
  accountId: string
  destinationAccountId: string
  amount: number
  /** Valor recebido no destino, quando difere do enviado. */
  transferAmount: number | null
  date: string
  description: string | null
}

/**
 * Espelho (is_mirror=true) da principal: só exibição na conta destino, sem
 * efeito no saldo. Usado pelo createTransfer e ao completar uma órfã, para
 * que os dois caminhos gerem o mesmo registro.
 */
export function buildTransferMirror(p: TransferPrimary, pairId: string) {
  return {
    account_id: p.destinationAccountId,
    type: 'transfer' as const,
    amount: p.transferAmount ?? p.amount,
    date: p.date,
    description: p.description,
    destination_account_id: p.accountId,
    transfer_pair_id: pairId,
    is_mirror: true,
    transfer_status: 'matched' as const,
  }
}

/**
 * Completa uma transferência órfã (type='transfer' sem destino nem par): ela
 * já é a principal — a trigger sempre a debitou da origem —, então só ganha o
 * destino e o par, e o espelho é criado. A origem continua com -amount; o
 * destino passa a receber COALESCE(transfer_amount, amount).
 */
export function planCompleteOrphan(
  orphan: { id: string; accountId: string; amount: number; transferAmount: number | null; date: string; description: string | null },
  destinationAccountId: string,
  pairId: string,
): PlannedOp[] {
  const mirror = buildTransferMirror({ ...orphan, destinationAccountId }, pairId)
  return [
    {
      op: 'update',
      id: orphan.id,
      patch: { destination_account_id: destinationAccountId, transfer_pair_id: pairId, transfer_status: 'matched' },
    },
    {
      op: 'insert',
      row: { ...mirror, import_hash: null, bank_transaction_id: null, category_id: null, category_source: null },
    },
  ]
}

function unlinkPatch(isMirror: boolean): TxPatch {
  return {
    type: isMirror ? 'income' : 'expense',
    destination_account_id: null,
    transfer_pair_id: null,
    is_mirror: false,
    transfer_status: null,
    category_id: null,
    category_source: null,
  }
}

/** Desfaz o par: cada perna volta a income/expense, sem categoria. Saldo inalterado. */
export function planUnlink(legs: { id: string; isMirror: boolean }[]): PlannedOp[] {
  return legs.map(l => ({ op: 'update' as const, id: l.id, patch: unlinkPatch(l.isMirror) }))
}

export interface UnlinkLeg {
  id: string
  isMirror: boolean
  importHash: string | null
  bankTransactionId: string | null
  createdAt: string
}

/**
 * Desfaz um par ainda pendente: só a perna que veio de extrato continua, como
 * income/expense sem categoria; a perna sem extrato — criada pelo sistema para
 * a outra conta — é apagada, então o saldo daquela conta volta ao que era antes
 * do par. Perna "de extrato" = tem import_hash ou FITID. Se nenhuma tiver (par
 * criado pelo vínculo manual a partir de uma transação digitada), fica a mais
 * antiga: a perna sintética sempre é criada depois da original. Sem como
 * distinguir, desfaz como um par confirmado (planUnlink).
 */
export function planUnlinkPending(legs: UnlinkLeg[]): PlannedOp[] {
  if (legs.length !== 2) return planUnlink(legs)
  const fromStatement = legs.filter(l => !!l.importHash || !!l.bankTransactionId)
  let keep: UnlinkLeg | undefined
  if (fromStatement.length === 1) keep = fromStatement[0]
  else if (fromStatement.length === 0 && legs[0].createdAt !== legs[1].createdAt) {
    keep = legs[0].createdAt < legs[1].createdAt ? legs[0] : legs[1]
  }
  if (!keep) return planUnlink(legs)
  const drop = legs.find(l => l.id !== keep!.id)!
  return [
    { op: 'update', id: keep.id, patch: unlinkPatch(keep.isMirror) },
    { op: 'delete', id: drop.id },
  ]
}

// ─── Revisão retroativa ───────────────────────────────────────────────────────

export interface HistoricalProposal {
  outId: string
  inId: string
  status: 'matched' | 'suggested'
}

/**
 * Varre income/expense fora de par e propõe pares pelo Sinal A, promovidos a
 * 'matched' quando o Sinal B confirma (uma das descrições cita a conta da
 * outra perna). Transações com mais de um candidato ficam de fora — vão para
 * `ambiguous` e só são vinculadas manualmente.
 */
export function findHistoricalPairs(
  txs: DetectionExisting[],
  accounts: DetectionAccount[],
): { proposals: HistoricalProposal[]; ambiguous: string[] } {
  const free = txs.filter(t => (t.type === 'income' || t.type === 'expense') && !t.transferPairId && !t.isMirror)
  const outs = free.filter(t => t.type === 'expense')
  const ins = free.filter(t => t.type === 'income')

  const candidatesOf = new Map<string, string[]>()
  const push = (k: string, v: string) => candidatesOf.set(k, [...(candidatesOf.get(k) ?? []), v])
  for (const o of outs) {
    for (const n of ins) {
      if (o.accountId !== n.accountId && sameMovement(o.date, o.amount, n.date, n.amount)) {
        push(o.id, n.id)
        push(n.id, o.id)
      }
    }
  }

  const byId = new Map(free.map(t => [t.id, t]))
  const proposals: HistoricalProposal[] = []
  const ambiguous = new Set<string>()
  for (const o of outs) {
    const cs = candidatesOf.get(o.id) ?? []
    if (cs.length === 0) continue
    if (cs.length > 1) { ambiguous.add(o.id); cs.forEach(c => ambiguous.add(c)); continue }
    const n = byId.get(cs[0])!
    if ((candidatesOf.get(n.id) ?? []).length > 1) { ambiguous.add(o.id); ambiguous.add(n.id); continue }
    const bConfirms =
      matchAccountByName(o.description ?? '', accounts, o.accountId) === n.accountId ||
      matchAccountByName(n.description ?? '', accounts, n.accountId) === o.accountId
    proposals.push({ outId: o.id, inId: n.id, status: bConfirms ? 'matched' : 'suggested' })
  }
  return { proposals, ambiguous: Array.from(ambiguous) }
}
