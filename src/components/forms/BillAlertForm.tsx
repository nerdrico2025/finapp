'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { CurrencyInput } from '@/components/ui/CurrencyInput'
import { cn } from '@/lib/utils/cn'
import type { BillAlertFormData } from '@/lib/actions/billAlerts'

const FREQUENCIES = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
] as const

const schema = z.object({
  name: z.string().min(1, 'Informe o nome'),
  type: z.enum(['income', 'expense']),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']),
  amount: z.string().optional(),
  day_of_month: z.string().optional(),
  next_date: z.string().optional(),
  days_before: z.string().refine(
    (v) => { const n = parseInt(v); return n >= 1 && n <= 30 },
    'Deve ser entre 1 e 30 dias'
  ),
  end_date: z.string().optional(),
  is_active: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.frequency === 'monthly') {
    const n = parseInt(v.day_of_month ?? '')
    if (!(n >= 1 && n <= 31)) {
      ctx.addIssue({ code: 'custom', message: 'Dia deve estar entre 1 e 31', path: ['day_of_month'] })
    }
  } else if (!v.next_date) {
    ctx.addIssue({ code: 'custom', message: 'Informe a próxima data de vencimento', path: ['next_date'] })
  }
})

type FormRaw = z.infer<typeof schema>

interface Props {
  defaultValues?: Partial<BillAlertFormData>
  onSubmit: (data: BillAlertFormData) => Promise<{ error: string | null }>
  onCancel: () => void
  submitLabel?: string
}

export function BillAlertForm({ defaultValues, onSubmit, onCancel, submitLabel = 'Salvar' }: Props) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormRaw>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      type: defaultValues?.type ?? 'expense',
      frequency: defaultValues?.frequency ?? 'monthly',
      amount: defaultValues?.amount != null ? String(defaultValues.amount) : '',
      day_of_month: defaultValues?.day_of_month != null ? String(defaultValues.day_of_month) : '',
      next_date: defaultValues?.next_date ?? '',
      days_before: defaultValues?.days_before ? String(defaultValues.days_before) : '3',
      end_date: defaultValues?.end_date ?? '',
      is_active: defaultValues?.is_active ?? true,
    },
  })

  const type = watch('type')
  const frequency = watch('frequency')
  const isMonthly = frequency === 'monthly'

  async function handleFormSubmit(raw: FormRaw) {
    setServerError(null)
    const result = await onSubmit({
      name: raw.name,
      type: raw.type,
      frequency: raw.frequency,
      amount: raw.amount ? parseFloat(raw.amount) : null,
      day_of_month: isMonthly ? parseInt(raw.day_of_month ?? '') : null,
      next_date: isMonthly ? null : (raw.next_date || null),
      days_before: parseInt(raw.days_before),
      end_date: raw.end_date || null,
      is_active: raw.is_active,
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

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Nome da conta
        </label>
        <input
          type="text"
          placeholder="Ex: Aluguel, Cartão de crédito..."
          {...register('name')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

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
                'flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors',
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

      {/* Frequency */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Frequência
        </label>
        <select
          {...register('frequency')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        >
          {FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Valor estimado <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
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
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Day of month (monthly) or next occurrence (other frequencies) */}
        {isMonthly ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Dia do vencimento
            </label>
            <input
              type="number"
              min="1"
              max="31"
              placeholder="Ex: 10"
              {...register('day_of_month')}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            {errors.day_of_month && (
              <p className="mt-1 text-xs text-red-600">{errors.day_of_month.message}</p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Próximo vencimento
            </label>
            <input
              type="date"
              {...register('next_date')}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            {errors.next_date && (
              <p className="mt-1 text-xs text-red-600">{errors.next_date.message}</p>
            )}
          </div>
        )}

        {/* Days before */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Avisar com antecedência
          </label>
          <div className="relative">
            <input
              type="number"
              min="1"
              max="30"
              placeholder="3"
              {...register('days_before')}
              className="w-full px-3.5 pr-14 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">dias</span>
          </div>
          {errors.days_before && (
            <p className="mt-1 text-xs text-red-600">{errors.days_before.message}</p>
          )}
        </div>
      </div>

      {/* End date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Repetir até <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <input
          type="date"
          {...register('end_date')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      {/* Active */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
        <input
          id="is_active"
          type="checkbox"
          {...register('is_active')}
          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <label htmlFor="is_active" className="flex-1">
          <p className="text-sm font-medium text-gray-700">Alerta ativo</p>
          <p className="text-xs text-gray-400">Você será avisado quando o vencimento estiver próximo</p>
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
