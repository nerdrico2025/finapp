import { computeOption, summarizeOptions, optionInputFromTrade } from './calc'
import { optionPeriodDate, summarizePartial, type PartialSummary } from './partial-summary'
import type { TradeOperation } from '@/types'

export interface OptionsPeriodSummary {
  /** Encerradas, exercidas e que viraram pó com saída no período. */
  realizedResult: number
  closedCount: number
  /** Todas as abertas com prêmio atual, independente do período. */
  partial: PartialSummary
  openCount: number
  missingPremiumCount: number
  /** Operações de opções de qualquer período. */
  totalCount: number
}

export function summarizeOptionsPeriod(
  trades: TradeOperation[],
  periodStart: string,
  periodEnd: string,
): OptionsPeriodSummary {
  const options = trades.filter((t) => t.type === 'options')
  const closed = options.filter((t) => {
    if (t.option_status === 'open') return false
    const date = optionPeriodDate(t)
    return date >= periodStart && date <= periodEnd
  })
  const partial = summarizePartial(options)

  return {
    realizedResult: summarizeOptions(closed.map(optionInputFromTrade)).realizedResult,
    closedCount: closed.length,
    partial,
    openCount: options.filter((t) => t.option_status === 'open').length,
    missingPremiumCount: partial.missingPremiumCount,
    totalCount: options.length,
  }
}

/**
 * Rentabilidade do parcial só dos titulares abertos com prêmio atual: lançador
 * não tem capital pago, então seu resultado distorceria o percentual. Nulo sem
 * capital.
 */
export function partialReturnPct(trades: TradeOperation[]): number | null {
  const holders = trades.filter((t) => t.position === 'holder')
  const { result } = summarizePartial(holders)
  let capital = 0
  for (const t of holders) {
    if (t.option_status !== 'open') continue
    const c = computeOption(optionInputFromTrade(t))
    if (c.resultKind === 'unrealized') capital += c.paid ?? 0
  }
  return capital > 0 ? (result / capital) * 100 : null
}

export function hasWriterPartial(trades: TradeOperation[]): boolean {
  return summarizePartial(trades.filter((t) => t.position === 'writer')).includedCount > 0
}

export function monthRange(month: number, year: number): { start: string; end: string } {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

/** Linhas de contexto do Resultado parcial, iguais na aba Operações e no Dashboard. */
export function describePartial(p: PartialSummary): { details: string | null; warning: string | null } {
  const parts: string[] = []
  if (p.includedCount > 0) {
    parts.push(`${p.includedCount} ${p.includedCount === 1 ? 'aberta' : 'abertas'}`)
    if (p.oldestUpdatedAt) {
      const date = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
      }).format(new Date(p.oldestUpdatedAt))
      parts.push(`preços de ${date}`)
    }
  }
  return {
    details: parts.length > 0 ? parts.join(' · ') : null,
    warning: p.missingPremiumCount > 0 ? `${p.missingPremiumCount} sem prêmio atualizado` : null,
  }
}
