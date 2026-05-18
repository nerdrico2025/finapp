'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { CurrencyInput } from '@/components/ui/CurrencyInput'
import type { GoalFormData } from '@/lib/actions/goals'

const ICON_SUGGESTIONS = ['🏠', '🚗', '✈️', '🎓', '💎', '📱', '🏖️', '💪', '👶', '💻', '🌍', '🐶']
const COLOR_PRESETS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316']

const schema = z.object({
  name: z.string().min(1, 'Informe o nome'),
  description: z.string().optional(),
  target_amount: z.string().refine((v) => parseFloat(v) > 0, 'Informe um valor maior que zero'),
  current_amount: z.string().optional(),
  target_date: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
})

type FormRaw = z.infer<typeof schema>

interface Props {
  defaultValues?: Partial<GoalFormData>
  onSubmit: (data: GoalFormData) => Promise<{ error: string | null }>
  onCancel: () => void
  submitLabel?: string
}

export function GoalForm({ defaultValues, onSubmit, onCancel, submitLabel = 'Salvar' }: Props) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormRaw>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      target_amount: defaultValues?.target_amount ? String(defaultValues.target_amount) : '',
      current_amount: defaultValues?.current_amount ? String(defaultValues.current_amount) : '',
      target_date: defaultValues?.target_date ?? '',
      icon: defaultValues?.icon ?? '',
      color: defaultValues?.color ?? COLOR_PRESETS[0],
    },
  })

  const selectedColor = watch('color')
  const selectedIcon = watch('icon')

  async function handleFormSubmit(raw: FormRaw) {
    setServerError(null)
    const result = await onSubmit({
      name: raw.name,
      description: raw.description || null,
      target_amount: parseFloat(raw.target_amount),
      current_amount: raw.current_amount ? parseFloat(raw.current_amount) : 0,
      target_date: raw.target_date || null,
      icon: raw.icon || null,
      color: raw.color || null,
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

      {/* Icon + Color row */}
      <div className="flex gap-4">
        {/* Icon */}
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Ícone</label>
          <input
            type="text"
            maxLength={2}
            placeholder="🎯"
            {...register('icon')}
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {ICON_SUGGESTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setValue('icon', emoji)}
                className={cn(
                  'w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors',
                  selectedIcon === emoji ? 'bg-emerald-100 ring-1 ring-emerald-400' : 'hover:bg-gray-100'
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Cor</label>
          <div className="grid grid-cols-4 gap-1.5">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setValue('color', color)}
                className={cn(
                  'w-7 h-7 rounded-full border-2 transition-transform',
                  selectedColor === color ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome da meta</label>
        <input
          type="text"
          placeholder="Ex: Casa própria, Viagem para Europa..."
          {...register('name')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Descrição <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <textarea
          rows={2}
          placeholder="Detalhes da meta..."
          {...register('description')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Target amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor da meta</label>
          <Controller
            name="target_amount"
            control={control}
            render={({ field }) => (
              <CurrencyInput
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          {errors.target_amount && (
            <p className="mt-1 text-xs text-red-600">{errors.target_amount.message}</p>
          )}
        </div>

        {/* Current amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Já guardei <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <Controller
            name="current_amount"
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
      </div>

      {/* Target date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Prazo <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <input
          type="date"
          {...register('target_date')}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
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
