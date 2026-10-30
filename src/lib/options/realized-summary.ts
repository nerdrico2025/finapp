import type { VisibleTradeTypes } from './visible-trade-types'

export interface RealizedInput {
  resultado: number | null
  rentPct: number | null
  resultKind?: 'realized' | 'unrealized' | null
}

export interface RealizedSummary {
  totalProfit: number
  totalLoss: number
  netResult: number
  /** Nulos sem operação encerrada: "—" na tela, nunca 0%. */
  winRate: number | null
  avgRent: number | null
}

export function summarizeRealized(items: RealizedInput[]): RealizedSummary {
  let profit = 0, loss = 0, wins = 0, total = 0, rentSum = 0
  for (const c of items) {
    if (c.resultado == null || c.resultKind === 'unrealized') continue
    total++
    if (c.resultado > 0) { profit += c.resultado; wins++ }
    else loss += c.resultado
    if (c.rentPct != null) rentSum += c.rentPct
  }
  return {
    totalProfit: profit,
    totalLoss: loss,
    netResult: profit + loss,
    winRate: total > 0 ? (wins / total) * 100 : null,
    avgRent: total > 0 ? rentSum / total : null,
  }
}

export function realizedLabel(visible: Pick<VisibleTradeTypes, 'swing' | 'options'>): string {
  const types = visible.swing && visible.options
    ? 'Swing Trade + Opções'
    : visible.options ? 'Opções' : 'Swing Trade'
  return `Resultado realizado · ${types} (encerradas)`
}
