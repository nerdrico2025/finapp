import type { TradeOperation } from '@/types'
import { computeOption, LOT_WARNING, optionInputFromTrade } from './calc'

/**
 * Encerramento de opção antes do vencimento, total ou parcial.
 * Quantidade é sempre quantidade de opções: nenhum multiplicador de lote.
 */
export interface PartialCloseInput {
  trade: TradeOperation
  closedQuantity: number
  exitPremium: number
  exitDate: string
  /** Taxas da saída, somadas às taxas da parte encerrada. */
  exitFees?: number
}

/** Linha nova, já encerrada; o banco gera id, timestamps e não recebe eventos do Calendar. */
export type ClosedTradeRow = Omit<TradeOperation, 'id' | 'created_at' | 'updated_at'>

export interface PartialCloseResult {
  /** Parcial: a nova operação encerrada. Total: o estado final da própria operação. */
  closedRow: ClosedTradeRow
  /** Parcial: a operação original, ainda aberta, com quantidade e taxas reduzidas. Total: null. */
  remainingRow: TradeOperation | null
  resultado: number
  rentabilidade: number | null
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function validateClosedQuantity(
  closedQuantity: number,
  openQuantity: number,
): { error: string | null; warning: string | null } {
  if (!Number.isInteger(closedQuantity) || closedQuantity <= 0) {
    return { error: 'Informe uma quantidade inteira maior que zero.', warning: null }
  }
  if (closedQuantity > openQuantity) {
    return { error: `A quantidade encerrada não pode passar de ${openQuantity}.`, warning: null }
  }
  return { error: null, warning: closedQuantity % 100 !== 0 ? LOT_WARNING : null }
}

/**
 * Taxa de entrada proporcional à quantidade: a parte encerrada é arredondada
 * e a aberta fica com o resto, para a soma bater exatamente com a original.
 */
export function splitFees(fees: number, closedQuantity: number, totalQuantity: number) {
  const closed = round2((fees * closedQuantity) / totalQuantity)
  return { closed, remaining: round2(fees - closed) }
}

export function buildPartialClose(input: PartialCloseInput): PartialCloseResult {
  const { trade, closedQuantity, exitPremium, exitDate } = input
  const exitFees = input.exitFees ?? 0

  const { error } = validateClosedQuantity(closedQuantity, trade.quantity)
  if (error) throw new Error(error)
  if (!(exitPremium >= 0)) throw new Error('Informe o prêmio de saída.')
  if (!(exitFees >= 0)) throw new Error('Taxas da saída não podem ser negativas.')

  const isPartial = closedQuantity < trade.quantity
  const fees = isPartial
    ? splitFees(trade.fees, closedQuantity, trade.quantity)
    : { closed: trade.fees, remaining: 0 }

  const { id: _id, created_at: _c, updated_at: _u, ...entry } = trade
  const closedRow: ClosedTradeRow = {
    ...entry,
    quantity: closedQuantity,
    fees: round2(fees.closed + exitFees),
    status: 'closed',
    option_status: 'closed',
    exit_price: exitPremium,
    exit_date: exitDate,
    underlying_price_at_exercise: null,
    // Avisos de vencimento e prêmio atual ficam só na operação que segue aberta.
    current_premium: isPartial ? null : trade.current_premium,
    current_premium_updated_at: isPartial ? null : trade.current_premium_updated_at,
    google_event_id: null,
    google_reminder_event_id: null,
  }

  const remainingRow: TradeOperation | null = isPartial
    ? { ...trade, quantity: trade.quantity - closedQuantity, fees: fees.remaining }
    : null

  const calc = computeOption(optionInputFromTrade({ ...closedRow, id: '', created_at: '', updated_at: '' }))

  return {
    closedRow,
    remainingRow,
    resultado: calc.result ?? 0,
    rentabilidade: calc.returnPct,
  }
}
