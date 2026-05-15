'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Category } from '@/types'

const PRESET_COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#64748b',
]

const SUGGESTED_ICONS = ['🍽️', '🚗', '🏠', '💊', '🎮', '📚', '👕', '📦', '💼', '💻', '📈', '💰', '✈️', '🎵', '🐾', '🏋️', '🎁', '🔧', '💡', '🛒']

const categorySchema = z.object({
  name: z.string().min(1, 'Informe o nome da categoria').max(40, 'Nome muito longo'),
  type: z.enum(['income', 'expense']),
  icon: z.string(),
  color: z.string().min(1, 'Selecione uma cor'),
})

type CategoryFormRaw = z.infer<typeof categorySchema>

export type CategoryFormValues = CategoryFormRaw

interface CategoryFormProps {
  defaultValues?: Partial<Category>
  fixedType?: 'income' | 'expense'
  onSubmit: (data: CategoryFormValues) => Promise<{ error: string | null }>
  onCancel: () => void
  submitLabel?: string
}

export function CategoryForm({
  defaultValues,
  fixedType,
  onSubmit,
  onCancel,
  submitLabel = 'Salvar',
}: CategoryFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [iconQuery, setIconQuery] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormRaw>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      type: fixedType ?? defaultValues?.type ?? 'expense',
      icon: defaultValues?.icon ?? '',
      color: defaultValues?.color ?? PRESET_COLORS[0],
    },
  })

  const selectedColor = watch('color')
  const selectedIcon = watch('icon')

  const filteredIcons = iconQuery
    ? SUGGESTED_ICONS.filter((_, i) => String(i).includes(iconQuery))
    : SUGGESTED_ICONS

  async function handleFormSubmit(data: CategoryFormRaw) {
    setServerError(null)
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

      {!fixedType && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo</label>
          <div className="flex gap-2">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setValue('type', t)}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors',
                  watch('type') === t
                    ? t === 'expense'
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                )}
              >
                {t === 'expense' ? '↓ Despesa' : '↑ Receita'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
        <input
          type="text"
          placeholder="Ex: Alimentação, Salário..."
          {...register('name')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        {errors.name && <p className="mt-1.5 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Ícone (emoji)</label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Digite ou cole um emoji..."
            value={selectedIcon}
            onChange={(e) => setValue('icon', e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          {selectedIcon && (
            <span className="w-10 h-10 flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg text-xl">
              {selectedIcon}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_ICONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setValue('icon', emoji)}
              className={cn(
                'w-8 h-8 text-lg rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100',
                selectedIcon === emoji && 'bg-emerald-50 ring-1 ring-emerald-400'
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

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
        {errors.color && <p className="mt-1.5 text-xs text-red-600">{errors.color.message}</p>}
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
