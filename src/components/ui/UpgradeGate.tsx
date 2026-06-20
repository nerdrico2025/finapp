'use client'

import Link from 'next/link'
import { LockKeyhole } from 'lucide-react'
import { usePlan } from '@/hooks/usePlan'
import type { PlanLimits } from '@/lib/plan'

interface UpgradeGateProps {
  feature: keyof PlanLimits
  children: React.ReactNode
  fallback?: React.ReactNode
}

function DefaultFallback() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[320px] rounded-2xl border border-amber-100 bg-amber-50/60 px-6 py-12 text-center">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 mb-4">
        <LockKeyhole className="w-7 h-7 text-amber-600" />
      </div>
      <p className="text-base font-semibold text-gray-900 mb-1">Disponível no plano Pro</p>
      <p className="text-sm text-gray-500 mb-6 max-w-xs">
        Faça upgrade para desbloquear este recurso e muito mais.
      </p>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Fazer upgrade
      </Link>
    </div>
  )
}

export function UpgradeGate({ feature, children, fallback }: UpgradeGateProps) {
  const { limits, isLoading, isSuperAdmin } = usePlan()

  // Super admin: acesso total — o gate não existe, renderiza direto
  if (isSuperAdmin) return <>{children}</>

  // Don't block while loading — avoids flash of locked content for pro users
  if (isLoading || !limits) return <>{children}</>

  if (limits[feature] === false) {
    return <>{fallback ?? <DefaultFallback />}</>
  }

  return <>{children}</>
}
