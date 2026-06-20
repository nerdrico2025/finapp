import type { Profile } from '@/types'

export type PlanLimits = {
  maxTransactionsPerMonth: number | null
  maxAccounts: number | null
  canImport: boolean
  canAccessReports: boolean
  canAccessSimulator: boolean
  canAccessDreamList: boolean
  canAccessPJ: boolean
  canAccessPF: boolean
  canAccessAI: boolean
}

export const FREE_LIMITS: PlanLimits = {
  maxTransactionsPerMonth: 30,
  maxAccounts: 2,
  canImport: false,
  canAccessReports: false,
  canAccessSimulator: false,
  canAccessDreamList: false,
  canAccessPJ: false,
  canAccessPF: false,
  canAccessAI: false,
}

const PRO_BASE: PlanLimits = {
  maxTransactionsPerMonth: null,
  maxAccounts: null,
  canImport: true,
  canAccessReports: true,
  canAccessSimulator: true,
  canAccessDreamList: true,
  canAccessPJ: false,
  canAccessPF: false,
  canAccessAI: true,
}

// Super admins (profiles.role === 'admin') têm acesso ilimitado a tudo,
// independente de plano Stripe. Contadores numéricos viram Infinity e todas
// as flags de feature ficam true.
const ADMIN_LIMITS: PlanLimits = {
  maxTransactionsPerMonth: Infinity,
  maxAccounts: Infinity,
  canImport: true,
  canAccessReports: true,
  canAccessSimulator: true,
  canAccessDreamList: true,
  canAccessPJ: true,
  canAccessPF: true,
  canAccessAI: true,
}

export function isSuperAdmin(profile: Profile): boolean {
  return profile.role === 'admin'
}

export function isPlanActive(profile: Profile): boolean {
  // Super admin nunca depende de assinatura Stripe.
  if (isSuperAdmin(profile)) return true
  if (profile.plan_type === 'free') return true
  if (profile.subscription_status === 'active') return true
  if (
    profile.subscription_status === 'canceled' &&
    profile.current_period_end &&
    new Date(profile.current_period_end) > new Date()
  ) return true
  return false
}

export function getPlanLimits(profile: Profile): PlanLimits {
  // Bypass total para super admin — antes de qualquer lógica de Stripe/plano.
  if (isSuperAdmin(profile)) return ADMIN_LIMITS

  const { plan_type, plan_pf_active, plan_pj_active } = profile

  if (plan_type === 'free' || !isPlanActive(profile)) return FREE_LIMITS

  if (plan_type === 'pro_pf') {
    return { ...PRO_BASE, canAccessPF: true, canAccessPJ: plan_pj_active }
  }

  if (plan_type === 'pro_pj') {
    return { ...PRO_BASE, canAccessPJ: true, canAccessPF: plan_pf_active }
  }

  return FREE_LIMITS
}
