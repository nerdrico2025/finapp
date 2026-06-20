'use client'

import { useRouter } from 'next/navigation'
import { LockKeyhole, X } from 'lucide-react'
import { usePlan } from '@/hooks/usePlan'

interface UpgradePromptProps {
  feature: 'transactions' | 'accounts' | 'importacao' | 'relatorios' | 'simulador' | 'lista-sonhos'
  message: string
  onClose?: () => void
}

export function UpgradePrompt({ message, onClose }: UpgradePromptProps) {
  const router = useRouter()
  const { isSuperAdmin } = usePlan()

  // Super admin não tem limite de plano — nenhum banner de upgrade
  if (isSuperAdmin) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex gap-3">
        <div className="mt-0.5 flex-shrink-0">
          <LockKeyhole className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900">Limite do plano gratuito</p>
          <p className="mt-0.5 text-sm text-amber-800">{message}</p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/pricing')}
              className="text-sm font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700 transition-colors"
            >
              Ver planos
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-amber-700 hover:text-amber-600 transition-colors"
              >
                Fechar
              </button>
            )}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 text-amber-500 hover:text-amber-700 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
