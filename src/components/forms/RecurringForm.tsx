'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { CurrencyInput } from '@/components/ui/CurrencyInput'
import type { Account, Category, RecurringRule } from '@/types'

export const FREQUENCY_LABELS: Record<string, string> = {
  daily:     'Diária',
  weekly:    'Semanal',
  biweekly:  'Quinzenal',
  monthly:   'Mensal',
  quarterly: 'Trimestral',
  yearly:    'Anual',
}

const recurringSchema = z.object({
  name: z.string().min(1, 'Informe o nome'),
  type: z.enum(['income', 'expense']),
  amount: z.string().min(1, 'Informe o valor'),
  account_id: z.string().min(1, 'Selecione uma conta'),
  category_id: z.string().optional(),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']),
  start_date: z.string().min(1, 'Informe a data de início'),
  end_date: z.string().optional(),
  auto_create: z.boolean(),
})

type RecurringFormRaw = z.infer<typeof recurringSchema>

export interface RecurringFormValues extends Omit<RecurringFormRaw, 'amount' | 'category_id' | 'end_date'> {
  amount: number
  category_id?: string | null
  end_date?: string | null
}

interface RecurringFormProps {
  accounts: Account[]
  categories: Category[]
  defaultValues?: Partial<RecurringRule>
  onSubmit: (data: RecurringFormValues) => Promise<{ error: string | null }>
  onCancel: () => void
  submitLabel?: string
}

export function RecurringForm({
  accounts,
  categories,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Salvar',
}: RecurringFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RecurringFormRaw>({
    resolver: zodResolver(recurringSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      type: (defaultValues?.type as 'income' | 'expense') ?? 'expense',
      amount: defaultValues?.amount ? String(defaultValues.amount) : '',
      account_id: defaultValues?.account_id ?? accounts[0]?.id ?? '',
      category_id: defaultValues?.category_id ?? '',
      frequency: defaultValues?.frequency ?? 'monthly',
      start_date: defaultValues?.start_date ?? today,
      end_date: defaultValues?.end_date ?? '',
      auto_create: defaultValues?.auto_create ?? true,
    },
  })

  const type = watch('type')
  const filteredCategories = categories.filter((c) => c.type === type)

  async function handleFormSubmit(raw: RecurringFormRaw) {
    setServerError(null)
    const result = await onSubmit({
      ...raw,
      name: raw.name,
      amount: parseFloat(raw.amount) || 0,
      category_id: raw.category_id || null,
      end_date: raw.end_date || null,
    })
    if (result.error) setServerError(result.error)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {serverError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      {/* Type toggle */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo</label>
        <div className="flex gap-1.5 p-1 bg-gray-100 rounded-lg">
          {(['expense', 'income'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setValue('type', t)}
              className={cn(
                'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors',
                type === t
                  ? t === 'expense'
                    ? 'bg-white text-red-700 shadow-sm'
                    : 'bg-white text-emerald-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t === 'expense' ? '↓ Despesa' : '↑ Receita'}
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
        <input
          type="text"
          placeholder="Ex: Aluguel, Salário mensal..."
          {...register('name')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor</label>
          <Controller
            name="amount"
            control={control}
            render={({ field }) => (
              <CurrencyInput
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
        </div>

        {/* Frequency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Frequência</label>
          <select
            {...register('frequency')}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          >
            {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Account */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Conta</label>
        <select
          {...register('account_id')}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        >
          <option value="">Selecione uma conta</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {errors.account_id && (
          <p className="mt-1 text-xs text-red-600">{errors.account_id.message}</p>
        )}
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Categoria</label>
        <select
          {...register('category_id')}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        >
          <option value="">Sem categoria</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Start date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Data de início</label>
          <input
            type="date"
            {...register('start_date')}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          {errors.start_date && (
            <p className="mt-1 text-xs text-red-600">{errors.start_date.message}</p>
          )}
        </div>

        {/* End date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Data de término <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="date"
            {...register('end_date')}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Auto create toggle */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
        <input
          id="auto_create"
          type="checkbox"
          {...register('auto_create')}
          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <label htmlFor="auto_create" className="flex-1">
          <p className="text-sm font-medium text-gray-700">Criar automaticamente</p>
          <p className="text-xs text-gray-400">
            A transação será criada no vencimento sem precisar confirmar
          </p>
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
