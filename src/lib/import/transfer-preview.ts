/**
 * Estado de transferência de uma linha na prévia da importação e as edições
 * manuais sobre ele. A edição do usuário (conta destino, "não é
 * transferência", escolha do par) sempre prevalece sobre a detecção.
 */

import type { TransferCandidate, TransferDetection, TransferDetectionStatus } from './transfer-detection'
import type { ImportTransferAction } from './transfer-writes'
import { matchesHolder, type AccountHolder } from './holder-signal'

/**
 * 'unassigned': marcada como transferência (pelo usuário ou pelo sinal
 * "titular") mas ainda sem conta destino — nunca é gravada assim; a linha fica
 * desmarcada até o destino ser escolhido.
 */
export type RowTransferStatus = TransferDetectionStatus | 'unassigned'

export interface RowTransferState {
  status: RowTransferStatus
  action: ImportTransferAction | null
  candidates: TransferCandidate[]
  destinationAccountId: string | null
  alreadyRecorded: boolean
  /** Definido pelo usuário — uma nova detecção não sobrescreve. */
  manual: boolean
  /** Veio do sinal "titular" (descrição cita o nome do usuário). */
  holder?: boolean
  /** Várias pernas pendentes possíveis, sem data exata e empatadas — não absorve. */
  pendingTie?: boolean
}

export const TRANSFER_STATUS_LABEL: Record<Exclude<RowTransferStatus, 'none'>, string> = {
  matched: 'Confirmada',
  suggested: 'Possível',
  pending: 'Pendente',
  ambiguous: 'Escolher par',
  unassigned: 'Escolha a conta destino',
}

/** Converte a saída do motor. Pares dentro do lote não existem na importação de uma conta só. */
export function fromDetection(d: TransferDetection | null): RowTransferState | null {
  if (!d || d.status === 'none') return null
  const a = d.action
  const action: ImportTransferAction | null =
    a?.kind === 'absorb' || a?.kind === 'convert' || a?.kind === 'createPair' ? a : null
  return {
    status: action || d.status === 'ambiguous' ? d.status : 'ambiguous',
    action,
    candidates: d.candidates.filter(c => c.kind !== 'row'),
    destinationAccountId: d.destinationAccountId,
    alreadyRecorded: d.alreadyRecorded && action?.kind === 'absorb',
    manual: false,
    ...(d.pendingTie ? { pendingTie: true } : {}),
  }
}

/**
 * Data da perna pendente que a linha vai absorver, quando difere da data da
 * linha (a absorção tolera alguns dias) — para avisar o usuário na prévia.
 */
export function absorbedLegDateIfDifferent(t: RowTransferState | null | undefined, rowDate: string): string | null {
  if (!t || t.action?.kind !== 'absorb') return null
  const legId = t.action.legId
  const leg = t.candidates.find(c => c.kind === 'leg' && c.id === legId)
  return leg && leg.date !== rowDate ? leg.date : null
}

export function isTransferRow(t: RowTransferState | null | undefined): t is RowTransferState {
  return !!t && t.status !== 'none'
}

/** Linha absorvida por uma perna já registrada: não gera registro novo. */
export function isAbsorbed(t: RowTransferState | null | undefined): boolean {
  return !!t && t.status !== 'none' && t.alreadyRecorded && t.action?.kind === 'absorb'
}

/** Transferência ainda sem conta destino (não gera escrita). */
export function needsDestination(t: RowTransferState | null | undefined): boolean {
  return !!t && t.status === 'unassigned'
}

/** O usuário escolheu "Transferência" no tipo da linha. */
export function markAsTransfer(t: RowTransferState | null | undefined): RowTransferState {
  return {
    status: 'unassigned', action: null, candidates: t?.candidates ?? [],
    destinationAccountId: null, alreadyRecorded: false, manual: true, holder: t?.holder ?? false,
  }
}

/** Sinal "titular": transferência pré-marcada, destino a escolher. */
export function holderTransfer(): RowTransferState {
  return {
    status: 'unassigned', action: null, candidates: [],
    destinationAccountId: null, alreadyRecorded: false, manual: false, holder: true,
  }
}

/**
 * Estado de uma linha a partir da detecção. Os sinais A/B (e a absorção) têm
 * prioridade; o sinal "titular" só vale para linhas sem outro resultado.
 */
export function previewTransferState(
  detection: TransferDetection | null,
  description: string,
  holder: AccountHolder | null,
): RowTransferState | null {
  return fromDetection(detection) ?? (matchesHolder(description, holder) ? holderTransfer() : null)
}

/** "Não é transferência". */
export function clearTransfer(t: RowTransferState | null | undefined): RowTransferState {
  return {
    status: 'none', action: null, candidates: t?.candidates ?? [],
    destinationAccountId: null, alreadyRecorded: false, manual: true,
  }
}

function counterpartOf(c: TransferCandidate): string | null {
  return c.kind === 'leg' ? c.counterpartAccountId : c.accountId
}

/** O usuário escolheu um dos candidatos (caso ambíguo ou troca de par). */
export function chooseCandidate(t: RowTransferState, c: TransferCandidate): RowTransferState {
  if (c.kind === 'row') return t
  return {
    ...t,
    status: 'matched',
    action: c.kind === 'leg' ? { kind: 'absorb', legId: c.id } : { kind: 'convert', existingId: c.id },
    destinationAccountId: counterpartOf(c),
    alreadyRecorded: c.kind === 'leg',
    manual: true,
  }
}

/**
 * O usuário escolheu a conta destino. Se a contraparte já existe nessa conta,
 * o par é confirmado com ela; com mais de uma, ele escolhe; sem nenhuma, o par
 * é criado como pendente.
 */
export function chooseDestination(t: RowTransferState | null | undefined, accountId: string): RowTransferState {
  const candidates = t?.candidates ?? []
  const inAccount = candidates.filter(c => c.kind !== 'row' && counterpartOf(c) === accountId)
  const base: RowTransferState = {
    status: 'pending', action: null, candidates, destinationAccountId: accountId, alreadyRecorded: false, manual: true,
    holder: t?.holder ?? false,
  }
  if (inAccount.length === 1) return chooseCandidate(base, inAccount[0])
  if (inAccount.length > 1) return { ...base, status: 'ambiguous' }
  return { ...base, action: { kind: 'createPair', counterpartAccountId: accountId } }
}

/** Ação enviada ao servidor; ambíguo sem escolha vai como income/expense comum. Sem destino nunca grava. */
export function importActionOf(t: RowTransferState | null | undefined): ImportTransferAction | null {
  if (!t || t.status === 'none' || t.status === 'ambiguous' || t.status === 'unassigned') return null
  return t.action
}

// ─── Marcação da linha ────────────────────────────────────────────────────────

export interface CheckableRow {
  checked: boolean
  duplicate?: unknown
  warning?: string
}

/** `checked` da linha depois que a detecção (não o usuário) define o estado. */
export function checkedAfterDetection(row: CheckableRow, t: RowTransferState | null): boolean {
  if (isAbsorbed(t) || needsDestination(t)) return false
  return row.checked
}

/**
 * `checked` da linha depois de uma edição manual de transferência:
 * - absorvida ou sem destino → desmarcada (não gera linha / não pode gravar);
 * - o usuário escolheu um destino → marcada (antes ficava como estava, e linha
 *   desmarcada é ignorada na importação);
 * - saiu de absorvida → volta a ser importável;
 * - saiu de "sem destino" para receita/despesa → marcada, salvo duplicata ou aviso.
 */
export function checkedAfterTransferEdit(
  row: CheckableRow,
  prev: RowTransferState | null | undefined,
  next: RowTransferState,
): boolean {
  if (isAbsorbed(next) || needsDestination(next)) return false
  if (next.status !== 'none' && next.destinationAccountId) return true
  if (isAbsorbed(prev)) return true
  if (needsDestination(prev)) return !row.duplicate && !row.warning
  return row.checked
}

// ─── Tipo da linha (Receita / Despesa / Transferência) ────────────────────────

export type RowKind = 'income' | 'expense' | 'transfer'

export interface TypedRow {
  type: 'income' | 'expense'
  /** Com sinal: negativo = despesa. */
  amount: number
  transfer?: RowTransferState | null
}

export function rowKind(row: TypedRow): RowKind {
  return isTransferRow(row.transfer) ? 'transfer' : row.type
}

/**
 * Patch da linha para a escolha no controle de tipo. Transferência mantém
 * valor e sinal (a direção vem do sinal). Receita/Despesa a partir de
 * transferência desfaz a transferência e volta ao tipo do sinal; se a escolha
 * for o tipo oposto, inverte o sinal (como o botão de antes). O valor absoluto
 * nunca muda. `resetCategory` quando o tipo da categoria deixa de servir.
 */
export function applyTypeChoice(row: TypedRow, choice: RowKind): {
  type: 'income' | 'expense'
  amount: number
  transfer: RowTransferState | null
  resetCategory: boolean
} {
  const current = rowKind(row)
  if (choice === current) return { type: row.type, amount: row.amount, transfer: row.transfer ?? null, resetCategory: false }
  if (choice === 'transfer') {
    return { type: row.type, amount: row.amount, transfer: markAsTransfer(row.transfer), resetCategory: false }
  }
  const transfer = current === 'transfer' ? clearTransfer(row.transfer) : (row.transfer ?? null)
  const bySign: 'income' | 'expense' = row.amount < 0 ? 'expense' : 'income'
  if (choice === bySign) return { type: bySign, amount: row.amount, transfer, resetCategory: row.type !== bySign }
  return { type: choice, amount: -row.amount, transfer, resetCategory: true }
}
