/**
 * Estado de transferência de uma linha na prévia da importação e as edições
 * manuais sobre ele. A edição do usuário (conta destino, "não é
 * transferência", escolha do par) sempre prevalece sobre a detecção.
 */

import type { TransferCandidate, TransferDetection, TransferDetectionStatus } from './transfer-detection'
import type { ImportTransferAction } from './transfer-writes'

export interface RowTransferState {
  status: TransferDetectionStatus
  action: ImportTransferAction | null
  candidates: TransferCandidate[]
  destinationAccountId: string | null
  alreadyRecorded: boolean
  /** Definido pelo usuário — uma nova detecção não sobrescreve. */
  manual: boolean
}

export const TRANSFER_STATUS_LABEL: Record<Exclude<TransferDetectionStatus, 'none'>, string> = {
  matched: 'Confirmada',
  suggested: 'Possível',
  pending: 'Pendente',
  ambiguous: 'Escolher par',
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
  }
}

export function isTransferRow(t: RowTransferState | null | undefined): t is RowTransferState {
  return !!t && t.status !== 'none'
}

/** Linha absorvida por uma perna já registrada: não gera registro novo. */
export function isAbsorbed(t: RowTransferState | null | undefined): boolean {
  return !!t && t.status !== 'none' && t.alreadyRecorded && t.action?.kind === 'absorb'
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
  }
  if (inAccount.length === 1) return chooseCandidate(base, inAccount[0])
  if (inAccount.length > 1) return { ...base, status: 'ambiguous' }
  return { ...base, action: { kind: 'createPair', counterpartAccountId: accountId } }
}

/** Ação enviada ao servidor; ambíguo sem escolha vai como income/expense comum. */
export function importActionOf(t: RowTransferState | null | undefined): ImportTransferAction | null {
  if (!t || t.status === 'none' || t.status === 'ambiguous') return null
  return t.action
}
