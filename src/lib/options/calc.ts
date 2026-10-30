import type { OptionPosition, OptionStatus, TradeOperation } from '@/types'

export const LOT_WARNING =
  'Opções de ações na B3 normalmente são negociadas em lotes de 100. Confirme a quantidade na sua nota de corretagem.'

export const EXPIRY_NOTICE_DAYS = 7

export interface OptionInput {
  optionType: 'call' | 'put'
  position: OptionPosition
  quantity: number
  strike: number | null
  premium: number
  fees: number
  status: OptionStatus
  exitPremium: number | null
  currentPremium: number | null
  underlyingPriceAtExercise: number | null
}

export interface OptionCalc {
  premiumTotal: number
  /** Titular: desembolso (prêmio + taxas). */
  paid: number | null
  /** Titular: igual ao desembolso. */
  maxLoss: number | null
  /** Titular: strike ± prêmio. */
  breakEven: number | null
  /** Lançador: prêmio líquido das taxas. */
  received: number | null
  /** Lançador de put: quantidade × strike. */
  exposure: number | null
  result: number | null
  resultKind: 'realized' | 'unrealized' | null
  returnPct: number | null
  returnBasis: 'paid' | 'exposure' | null
}

export function computeOption(input: OptionInput): OptionCalc {
  const { optionType, position, quantity, strike, premium, fees } = input
  const isHolder = position === 'holder'
  const premiumTotal = quantity * premium
  const paid = isHolder ? premiumTotal + fees : null
  const exposure = !isHolder && optionType === 'put' && strike != null ? quantity * strike : null

  const { result, resultKind } = computeResult(input, premiumTotal)

  let returnPct: number | null = null
  let returnBasis: OptionCalc['returnBasis'] = null
  if (isHolder) returnBasis = 'paid'
  else if (exposure != null) returnBasis = 'exposure'
  const base = isHolder ? paid : exposure
  if (result != null && base != null && base > 0) returnPct = (result / base) * 100

  return {
    premiumTotal,
    paid,
    maxLoss: paid,
    breakEven: !isHolder || strike == null
      ? null
      : optionType === 'call' ? strike + premium : strike - premium,
    received: isHolder ? null : premiumTotal - fees,
    exposure,
    result,
    resultKind,
    returnPct,
    returnBasis,
  }
}

function computeResult(
  input: OptionInput,
  premiumTotal: number,
): Pick<OptionCalc, 'result' | 'resultKind'> {
  const { optionType, position, quantity, strike, premium, fees, status } = input
  const isHolder = position === 'holder'
  const sign = isHolder ? 1 : -1
  const fromExitPremium = (exit: number) => sign * (exit - premium) * quantity - fees

  if (status === 'closed' && input.exitPremium != null) {
    return { result: fromExitPremium(input.exitPremium), resultKind: 'realized' }
  }
  if (status === 'expired') {
    return { result: -sign * premiumTotal - fees, resultKind: 'realized' }
  }
  if (status === 'exercised' && strike != null && input.underlyingPriceAtExercise != null) {
    const spot = input.underlyingPriceAtExercise
    const intrinsic = optionType === 'call' ? spot - strike : strike - spot
    return { result: sign * (intrinsic - premium) * quantity - fees, resultKind: 'realized' }
  }
  if (status === 'open' && input.currentPremium != null) {
    return { result: fromExitPremium(input.currentPremium), resultKind: 'unrealized' }
  }
  return { result: null, resultKind: null }
}

export function optionInputFromTrade(t: TradeOperation): OptionInput {
  return {
    optionType: t.option_type ?? 'call',
    position: t.position,
    quantity: t.quantity,
    strike: t.strike,
    premium: t.premium ?? 0,
    fees: t.fees,
    status: t.option_status ?? 'open',
    exitPremium: t.exit_price,
    currentPremium: t.current_premium,
    underlyingPriceAtExercise: t.underlying_price_at_exercise,
  }
}

export interface OptionValidation {
  errors: { field: 'quantity' | 'strike' | 'premium'; message: string }[]
  warnings: string[]
}

export function validateOption(input: {
  quantity: number
  strike: number | null
  premium: number
}): OptionValidation {
  const errors: OptionValidation['errors'] = []
  const warnings: string[] = []
  if (!(input.quantity > 0)) errors.push({ field: 'quantity', message: 'Informe a quantidade de opções.' })
  if (!(input.strike != null && input.strike > 0)) errors.push({ field: 'strike', message: 'Informe o strike.' })
  if (!(input.premium > 0)) errors.push({ field: 'premium', message: 'Informe o prêmio por opção.' })
  if (input.quantity > 0 && input.quantity % 100 !== 0) warnings.push(LOT_WARNING)
  return { errors, warnings }
}

export interface OptionsSummary {
  /** Desembolso dos titulares. */
  paid: number
  /** Prêmio líquido recebido pelos lançadores. */
  received: number
  /** Puts lançadas ainda abertas: obrigação potencial, não é patrimônio. */
  openExposure: number
  realizedResult: number
  unrealizedResult: number
}

export function summarizeOptions(inputs: OptionInput[]): OptionsSummary {
  const summary: OptionsSummary = { paid: 0, received: 0, openExposure: 0, realizedResult: 0, unrealizedResult: 0 }
  for (const input of inputs) {
    const c = computeOption(input)
    summary.paid += c.paid ?? 0
    summary.received += c.received ?? 0
    if (input.status === 'open') summary.openExposure += c.exposure ?? 0
    if (c.resultKind === 'realized') summary.realizedResult += c.result ?? 0
    if (c.resultKind === 'unrealized') summary.unrealizedResult += c.result ?? 0
  }
  return summary
}

export function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000)
}

export function todayInBrazil(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
}

export interface OptionExpiryNotice {
  id: string
  series: string
  expirationDate: string
  daysUntil: number
  message: string
}

type ExpiryFields = Pick<TradeOperation, 'id' | 'ticker' | 'option_series' | 'option_status' | 'expiration_date'>

/**
 * Abertas a partir de D-7. Seguem listadas depois do vencimento até serem
 * encerradas, porque a operação só sai do estado 'open' com ação do usuário.
 */
export function getOptionExpiryNotices(trades: ExpiryFields[], today: string): OptionExpiryNotice[] {
  const notices: OptionExpiryNotice[] = []
  for (const t of trades) {
    if (t.option_status !== 'open' || !t.expiration_date) continue
    const daysUntil = daysBetween(today, t.expiration_date)
    if (daysUntil > EXPIRY_NOTICE_DAYS) continue
    const series = t.option_series ?? t.ticker
    notices.push({
      id: t.id,
      series,
      expirationDate: t.expiration_date,
      daysUntil,
      message: `Vencimento de ${series}: o que aconteceu? Encerre a operação.`,
    })
  }
  return notices.sort((a, b) => a.daysUntil - b.daysUntil)
}

/**
 * Aceita "1.000", "1.000,50", "0,32" e também "0.32": com ponto decimal, o
 * prêmio não pode virar 32 por engano.
 */
export function parseDecimal(raw: string): number {
  const s = raw.trim()
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) return parseFloat(s.replace(/\./g, '')) || 0
  return parseFloat(s) || 0
}
