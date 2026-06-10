'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, CheckCircle2, XCircle, AlertCircle, Zap, Building2, User } from 'lucide-react'
import { createPortalSession, createCheckoutSession } from '@/lib/actions/stripe'
import type { Profile } from '@/types'

const STATUS_MAP: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  active: {
    label: 'Ativa',
    icon: <CheckCircle2 className="w-4 h-4" />,
    className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  canceled: {
    label: 'Cancelada',
    icon: <XCircle className="w-4 h-4" />,
    className: 'text-red-700 bg-red-50 border-red-200',
  },
  past_due: {
    label: 'Pagamento pendente',
    icon: <AlertCircle className="w-4 h-4" />,
    className: 'text-amber-700 bg-amber-50 border-amber-200',
  },
}

const PLAN_LABEL: Record<string, string> = {
  free: 'Gratuito',
  pro_pf: 'Pro PF',
  pro_pj: 'Pro PJ',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

interface Props {
  profile: Profile
  showSuccess: boolean
}

export function SubscriptionClient({ profile, showSuccess }: Props) {
  const router = useRouter()
  const [loadingPortal, setLoadingPortal] = useState(false)
  const [loadingPj, setLoadingPj] = useState(false)
  const [loadingPf, setLoadingPf] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const {
    plan_type,
    plan_pf_active,
    plan_pj_active,
    subscription_id,
    subscription_status,
    current_period_end,
  } = profile

  const status = subscription_status ? STATUS_MAP[subscription_status] ?? null : null
  const isActive = subscription_status === 'active'
  const isFree = plan_type === 'free'

  async function handlePortal() {
    setLoadingPortal(true)
    setActionError(null)
    const result = await createPortalSession()
    if ('error' in result) {
      setActionError(result.error)
      setLoadingPortal(false)
      return
    }
    router.push(result.url)
  }

  async function handleAddPj() {
    setLoadingPj(true)
    setActionError(null)
    const result = await createCheckoutSession(process.env.NEXT_PUBLIC_STRIPE_PRICE_ADDON_PJ!)
    if ('error' in result) {
      setActionError(result.error)
      setLoadingPj(false)
      return
    }
    router.push(result.url)
  }

  async function handleAddPf() {
    setLoadingPf(true)
    setActionError(null)
    const result = await createCheckoutSession(process.env.NEXT_PUBLIC_STRIPE_PRICE_ADDON_PF!)
    if ('error' in result) {
      setActionError(result.error)
      setLoadingPf(false)
      return
    }
    router.push(result.url)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Success banner */}
      {showSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <p className="text-sm font-medium">
            Assinatura ativada com sucesso! Bem-vindo ao plano Pro.
          </p>
        </div>
      )}

      {/* Error banner */}
      {actionError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
          <p className="text-sm">{actionError}</p>
        </div>
      )}

      {/* Current plan card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        <div className="px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Plano atual</p>
              <p className="text-lg font-bold text-gray-900">{PLAN_LABEL[plan_type] ?? plan_type}</p>
            </div>
          </div>
          {status && (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${status.className}`}>
              {status.icon}
              {status.label}
            </span>
          )}
        </div>

        {isActive && current_period_end && (
          <div className="px-6 py-4">
            <p className="text-sm text-gray-500">
              Próxima cobrança em{' '}
              <span className="font-semibold text-gray-800">{formatDate(current_period_end)}</span>
            </p>
          </div>
        )}

        {(plan_pf_active || plan_pj_active) && (
          <div className="px-6 py-4 space-y-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Módulos ativos</p>
            <div className="flex flex-wrap gap-2">
              {plan_pf_active && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  <User className="w-3.5 h-3.5" />
                  Módulo PF
                </span>
              )}
              {plan_pj_active && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200">
                  <Building2 className="w-3.5 h-3.5" />
                  Módulo PJ
                </span>
              )}
            </div>
          </div>
        )}

        {subscription_id && (
          <div className="px-6 py-4">
            <button
              onClick={handlePortal}
              disabled={loadingPortal}
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              {loadingPortal ? 'Redirecionando…' : 'Gerenciar assinatura'}
            </button>
          </div>
        )}
      </div>

      {/* Free plan CTA */}
      {isFree && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-100 px-6 py-5 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-600" />
            <p className="font-semibold text-amber-900">Você está no plano Gratuito</p>
          </div>
          <p className="text-sm text-amber-800">
            Faça upgrade para desbloquear transações ilimitadas, relatórios avançados e muito mais.
          </p>
          <a
            href="/pricing"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
          >
            <Zap className="w-4 h-4" />
            Ver planos →
          </a>
        </div>
      )}

      {/* Add-on modules */}
      {isActive && (
        <>
          {plan_type === 'pro_pf' && !plan_pj_active && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Módulos disponíveis
              </h2>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
                    <Building2 className="w-4.5 h-4.5 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Módulo PJ</p>
                    <p className="text-xs text-gray-500">Fluxo de Caixa, DRE e Consolidado</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <p className="text-sm font-bold text-gray-900">R$ 14,94<span className="text-xs font-normal text-gray-400">/mês</span></p>
                  <button
                    onClick={handleAddPj}
                    disabled={loadingPj}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {loadingPj ? 'Aguarde…' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {plan_type === 'pro_pj' && !plan_pf_active && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Módulos disponíveis
              </h2>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <User className="w-4.5 h-4.5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Módulo PF</p>
                    <p className="text-xs text-gray-500">Metas, Sonhos, Investimentos e Relatórios</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <p className="text-sm font-bold text-gray-900">R$ 4,20<span className="text-xs font-normal text-gray-400">/mês</span></p>
                  <button
                    onClick={handleAddPf}
                    disabled={loadingPf}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {loadingPf ? 'Aguarde…' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
