'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Account, AccountType } from '@/types'

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Conta Corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'investment', label: 'Investimentos' },
  { value: 'wallet', label: 'Dinheiro' },
  { value: 'other', label: 'Outro' },
]

const PRESET_COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#64748b',
]

const accountSchema = z.object({
  name: z.string().min(1, 'Informe o nome da conta').max(50, 'Nome muito longo'),
  type: z.enum(['checking', 'savings', 'credit_card', 'investment', 'wallet', 'other']),
  color: z.string().min(1, 'Selecione uma cor'),
  initial_balance: z.string(),
  currency: z.string(),
  include_in_total: z.boolean(),
})

type AccountFormRaw = z.infer<typeof accountSchema>

export type AccountFormValues = Omit<AccountFormRaw, 'initial_balance'> & {
  initial_balance: number
}

interface AccountFormProps {
  defaultValues?: Partial<Account>
  onSubmit: (data: AccountFormValues) => Promise<{ error: string | null }>
  onCancel: () => void
  submitLabel?: string
}

export function AccountForm({ defaultValues, onSubmit, onCancel, submitLabel = 'Salvar' }: AccountFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormRaw>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      type: defaultValues?.type ?? 'checking',
      color: defaultValues?.color ?? PRESET_COLORS[0],
      initial_balance: String(defaultValues?.initial_balance ?? 0),
      currency: defaultValues?.currency ?? 'BRL',
      include_in_total: defaultValues?.include_in_total ?? true,
    },
  })

  const selectedColor = watch('color')

  async function handleFormSubmit(raw: AccountFormRaw) {
    setServerError(null)
    const data: AccountFormValues = {
      ...raw,
      initial_balance: parseFloat(raw.initial_balance) || 0,
    }
    const result = await onSubmit(data)
    if (result.error) setServerError(result.error)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
      {serverError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome da conta</label>
        <input
          type="text"
          placeholder="Ex: Nubank, Carteira..."
          {...register('name')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        {errors.name && <p className="mt-1.5 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo</label>
        <select
          {...register('type')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {!defaultValues?.id && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Saldo inicial</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">R$</span>
            <input
              type="number"
              step="0.01"
              placeholder="0,00"
              {...register('initial_balance')}
              className="w-full pl-10 pr-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
          {errors.initial_balance && (
            <p className="mt-1.5 text-xs text-red-600">{errors.initial_balance.message}</p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setValue('color', color)}
              className={cn(
                'w-8 h-8 rounded-full transition-transform hover:scale-110',
                selectedColor === color && 'ring-2 ring-offset-2 ring-gray-400 scale-110'
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="include_in_total"
          type="checkbox"
          {...register('include_in_total')}
          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <label htmlFor="include_in_total" className="text-sm text-gray-700">
          Incluir no saldo total
        </label>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
        </button>
      </div>
    </form>
  )
}
