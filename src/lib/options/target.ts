import { computeOption, daysBetween, todayInBrazil } from './calc'
import type { OptionPosition, TradeOperation } from '@/types'

export const NEAR_TARGET_THRESHOLD_PCT = 80
export const STALE_AFTER_DAYS = 3

export type TargetStatus = 'none' | 'progress' | 'near' | 'reached' | 'stop_reached'

export interface TargetInput {
  // Tipo e strike definem a rentabilidade do lançador em computeOption.
  optionType: 'call' | 'put'
  position: OptionPosition
  strike: number | null
  premium: number
  currentPremium: number | null
  targetPremium: number | null
  stopPremium: number | null
  quantity: number
  fees: number
  currentPremiumUpdatedAt: string | null
  today: string
}

export interface TargetCalc {
  /** Piso em 0, sem teto: pode passar de 100. */
  progressPct: number | null
  status: TargetStatus
  projectedResultAtTarget: number | null
  projectedReturnPctAtTarget: number | null
  staleDays: number | null
  stale: boolean
}

export function computeTarget(input: TargetInput): TargetCalc {
  const { position, premium, currentPremium, targetPremium, stopPremium } = input
  const isHolder = position === 'holder'
  const sign = isHolder ? 1 : -1

  let progressPct: number | null = null
  if (targetPremium != null && currentPremium != null) {
    const path = sign * (targetPremium - premium)
    if (path > 0) {
      // Arredonda o ruído de ponto flutuante para 80% e 100% exatos baterem.
      const pct = Math.round((sign * (currentPremium - premium) / path) * 1e8) / 1e6
      progressPct = Math.max(0, pct)
    }
  }

  const stopCrossed = currentPremium != null && stopPremium != null &&
    (isHolder ? currentPremium <= stopPremium : currentPremium >= stopPremium)

  let status: TargetStatus = 'none'
  if (stopCrossed) status = 'stop_reached'
  else if (progressPct != null) {
    if (progressPct >= 100) status = 'reached'
    else if (progressPct >= NEAR_TARGET_THRESHOLD_PCT) status = 'near'
    else status = 'progress'
  }

  const projection = targetPremium == null ? null : computeOption({
    optionType: input.optionType,
    position,
    quantity: input.quantity,
    strike: input.strike,
    premium,
    fees: input.fees,
    status: 'closed',
    exitPremium: targetPremium,
    currentPremium: null,
    underlyingPriceAtExercise: null,
  })

  const staleDays = input.currentPremiumUpdatedAt
    ? daysBetween(todayInBrazil(new Date(input.currentPremiumUpdatedAt)), input.today)
    : null

  return {
    progressPct,
    status,
    projectedResultAtTarget: projection?.result ?? null,
    projectedReturnPctAtTarget: projection?.returnPct ?? null,
    staleDays,
    stale: staleDays != null && staleDays > STALE_AFTER_DAYS,
  }
}

export function targetInputFromTrade(t: TradeOperation, today: string): TargetInput {
  return {
    optionType: t.option_type ?? 'call',
    position: t.position,
    strike: t.strike,
    premium: t.premium ?? 0,
    currentPremium: t.current_premium,
    targetPremium: t.target_price,
    stopPremium: t.stop_loss,
    quantity: t.quantity,
    fees: t.fees,
    currentPremiumUpdatedAt: t.current_premium_updated_at,
    today,
  }
}

export interface TargetValidationError {
  field: 'target' | 'stop'
  message: string
}

export function validateTarget(input: {
  position: OptionPosition
  premium: number
  targetPremium: number | null
  stopPremium: number | null
}): TargetValidationError[] {
  const { position, premium, targetPremium, stopPremium } = input
  // Sem prêmio de entrada não há referência; validateOption já bloqueia esse caso.
  if (!(premium > 0)) return []

  const errors: TargetValidationError[] = []
  if (position === 'holder') {
    if (targetPremium != null && targetPremium <= premium) {
      errors.push({ field: 'target', message: 'Quem comprou precisa de um prêmio alvo acima do prêmio de entrada.' })
    }
    if (stopPremium != null && stopPremium >= premium) {
      errors.push({ field: 'stop', message: 'Quem comprou precisa de um prêmio de stop abaixo do prêmio de entrada.' })
    }
  } else {
    if (targetPremium != null && targetPremium >= premium) {
      errors.push({ field: 'target', message: 'Quem vendeu precisa de um prêmio alvo abaixo do prêmio de entrada.' })
    }
    if (stopPremium != null && stopPremium <= premium) {
      errors.push({ field: 'stop', message: 'Quem vendeu precisa de um prêmio de stop acima do prêmio de entrada.' })
    }
  }
  return errors
}

export interface OptionTargetNotice {
  id: string
  series: string
  status: Exclude<TargetStatus, 'none' | 'progress'>
  message: string
}

function formatPremium(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(value)
}

const NOTICE_ORDER: Record<OptionTargetNotice['status'], number> = { stop_reached: 0, reached: 1, near: 2 }

export function getOptionTargetNotices(trades: TradeOperation[], today: string): OptionTargetNotice[] {
  const notices: OptionTargetNotice[] = []
  for (const t of trades) {
    if (t.type !== 'options' || t.option_status !== 'open' || t.current_premium == null) continue
    const { status, progressPct } = computeTarget(targetInputFromTrade(t, today))
    if (status === 'none' || status === 'progress') continue

    const series = t.option_series ?? t.ticker
    const current = formatPremium(t.current_premium)
    const message = status === 'stop_reached'
      ? `${series}: prêmio atual ${current}, stop de ${formatPremium(t.stop_loss ?? 0)} atingido`
      : `${series}: prêmio atual ${current}, ${Math.floor(progressPct ?? 0)}% do caminho até o alvo ${formatPremium(t.target_price ?? 0)}`
    notices.push({ id: t.id, series, status, message })
  }
  return notices.sort((a, b) => NOTICE_ORDER[a.status] - NOTICE_ORDER[b.status])
}
