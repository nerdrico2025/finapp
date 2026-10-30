import { computeOption, optionInputFromTrade, summarizeOptions } from './calc'
import type { TradeOperation } from '@/types'

export interface PartialSummary {
  /** Soma das abertas com prêmio atual. */
  result: number
  /** Abertas com prêmio atual, as únicas que entram no resultado. */
  includedCount: number
  /** Abertas sem prêmio atual. */
  missingPremiumCount: number
  /** Atualização mais antiga entre as incluídas. */
  oldestUpdatedAt: string | null
}

export function summarizePartial(trades: TradeOperation[]): PartialSummary {
  const summary: PartialSummary = { result: 0, includedCount: 0, missingPremiumCount: 0, oldestUpdatedAt: null }
  for (const t of trades) {
    if (t.option_status !== 'open') continue
    const { result, resultKind } = computeOption(optionInputFromTrade(t))
    if (resultKind !== 'unrealized' || result == null) {
      summary.missingPremiumCount++
      continue
    }
    summary.result += result
    summary.includedCount++
    const updatedAt = t.current_premium_updated_at
    if (updatedAt && (!summary.oldestUpdatedAt || Date.parse(updatedAt) < Date.parse(summary.oldestUpdatedAt))) {
      summary.oldestUpdatedAt = updatedAt
    }
  }
  return summary
}

/** Encerradas contam pela saída; abertas, pela entrada. */
export function optionPeriodDate(t: TradeOperation): string {
  return t.option_status === 'open' ? t.entry_date : t.exit_date ?? t.entry_date
}

/**
 * Lista e cards realizados: opções encerradas pela data de saída, abertas e
 * swing pela entrada. Capital pago e prêmio recebido são desembolso e
 * recebimento na entrada, então seguem sempre a data de entrada. Parcial,
 * exposição e abertas da lista ignoram o período, porque uma posição aberta
 * continua em risco seja qual for a entrada.
 */
export function buildTradesView(trades: TradeOperation[], periodStart: string, periodEnd: string) {
  const inRange = (date: string) =>
    !periodStart || !periodEnd || (date >= periodStart && date <= periodEnd)
  const inPeriod = (t: TradeOperation) =>
    inRange(t.type === 'options' ? optionPeriodDate(t) : t.entry_date)
  const isOpenOption = (t: TradeOperation) => t.type === 'options' && t.option_status === 'open'
  const openOptions = trades.filter(isOpenOption)

  return {
    periodTrades: trades.filter(inPeriod),
    capitalTrades: trades.filter((t) => t.type === 'options' && inRange(t.entry_date)),
    partial: summarizePartial(trades),
    openExposure: summarizeOptions(openOptions.map(optionInputFromTrade)).openExposure,
    optionsList: trades.filter((t) => t.type === 'options' && (inPeriod(t) || isOpenOption(t))),
    outOfPeriodOpenIds: new Set(openOptions.filter((t) => !inPeriod(t)).map((t) => t.id)),
  }
}
