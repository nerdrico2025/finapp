'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/cn'
import { updatePreferences, updateVisibleTradeTypes } from '@/lib/actions/settings'
import type { VisibleTradeTypes } from '@/lib/options/visible-trade-types'

const CURRENCIES = [
  { value: 'BRL', label: 'Real brasileiro (R$)' },
  { value: 'USD', label: 'Dólar americano ($)' },
  { value: 'EUR', label: 'Euro (€)' },
  { value: 'GBP', label: 'Libra esterlina (£)' },
  { value: 'ARS', label: 'Peso argentino ($)' },
]

const schema = z.object({
  currency: z.string().min(1),
})

type Form = z.infer<typeof schema>

export function PreferencesClient({ currency, visibleTradeTypes }: {
  currency: string
  visibleTradeTypes: VisibleTradeTypes
}) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { currency },
  })

  async function onSubmit(data: Form) {
    const result = await updatePreferences(data)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Preferências salvas!')
      router.refresh()
    }
  }

  return (
    <div className="space-y-4">
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
        <SlidersHorizontal className="w-4 h-4 text-gray-400" />
        Preferências gerais
      </h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Moeda padrão
          </label>
          <select
            {...register('currency')}
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
          >
            {CURRENCIES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar preferências'}
          </button>
        </div>
      </form>
    </div>
    <TradeTypesCard initial={visibleTradeTypes} />
    </div>
  )
}

function TradeTypesCard({ initial }: { initial: VisibleTradeTypes }) {
  const router = useRouter()
  const [visible, setVisible] = useState({ swing: initial.swing, options: initial.options })
  const [isPending, startTransition] = useTransition()
  const onlyOneOn = visible.swing !== visible.options

  function toggle(type: 'swing' | 'options') {
    const previous = visible
    const next = { ...visible, [type]: !visible[type] }
    setVisible(next)
    startTransition(async () => {
      const { error } = await updateVisibleTradeTypes(next)
      if (error) {
        setVisible(previous)
        toast.error(error)
        return
      }
      toast.success('Preferências salvas!')
      router.refresh()
    })
  }

  const rows = [
    { type: 'swing' as const, label: 'Swing Trade' },
    { type: 'options' as const, label: 'Opções' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Tipos de operação visíveis</h2>
      <p className="text-xs text-gray-500 mb-4">
        Define o que aparece em Investimentos → Operações e no Dashboard. Ocultar um tipo não apaga nem altera os dados dele.
      </p>
      <div className="space-y-3 max-w-sm">
        {rows.map(({ type, label }) => {
          const on = visible[type]
          const isLast = on && onlyOneOn
          return (
            <div key={type} className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={label}
                disabled={isPending || isLast}
                onClick={() => toggle(type)}
                className={cn(
                  'relative w-10 h-6 rounded-full transition-colors disabled:cursor-not-allowed',
                  on ? 'bg-emerald-600' : 'bg-gray-300',
                  isLast && 'opacity-60',
                )}
              >
                <span className={cn('absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform', on && 'translate-x-4')} />
              </button>
            </div>
          )
        })}
      </div>
      {onlyOneOn && (
        <p className="mt-3 text-xs text-amber-600">
          Pelo menos um tipo precisa ficar visível, senão a tela de Operações ficaria vazia.
        </p>
      )}
    </div>
  )
}
