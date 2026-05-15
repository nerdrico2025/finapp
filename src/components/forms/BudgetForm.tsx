'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import type { BudgetFormData } from '@/lib/actions/budgets'
import type { Category } from '@/types'

const schema = z.object({
  category_id: z.string().min(1, 'Selecione uma categoria'),
  name: z.string().min(1, 'Informe o nome'),
  amount: z.string().refine((v) => parseFloat(v) > 0, 'Informe um valor maior que zero'),
})

type FormRaw = z.infer<typeof schema>

interface Props {
  categories: Category[]
  defaultValues?: Partial<BudgetFormData>
  isCreate?: boolean
  onSubmit: (data: BudgetFormData) => Promise<{ error: string | null }>
  onCancel: () => void
  submitLabel?: string
}

export function BudgetForm({
  categories, defaultValues, isCreate = false, onSubmit, onCancel, submitLabel = 'Salvar',
}: Props) {
  const [serverError, setServerError] = useState<string | null>(null)
  const prevCategoryRef = useRef<string>('')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormRaw>({
    resolver: zodResolver(schema),
    defaultValues: {
      category_id: defaultValues?.category_id ?? '',
      name: defaultValues?.name ?? '',
      amount: defaultValues?.amount ? String(defaultValues.amount) : '',
    },
  })

  const categoryId = watch('category_id')

  // Auto-fill name from category name when creating
  useEffect(() => {
    if (!isCreate || categoryId === prevCategoryRef.current) return
    prevCategoryRef.current = categoryId
    const cat = categories.find((c) => c.id === categoryId)
    if (cat) setValue('name', cat.name)
  }, [categoryId, categories, isCreate, setValue])

  async function handleFormSubmit(raw: FormRaw) {
    setServerError(null)
    const result = await onSubmit({
      category_id: raw.category_id,
      name: raw.name,
      amount: parseFloat(raw.amount),
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

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Categoria</label>
        <select
          {...register('category_id')}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        >
          <option value="">Selecione uma categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ''}{c.name}
            </option>
          ))}
        </select>
        {errors.category_id && (
          <p className="mt-1 text-xs text-red-600">{errors.category_id.message}</p>
        )}
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do orçamento</label>
        <input
          type="text"
          placeholder="Ex: Alimentação, Transporte..."
          {...register('name')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Limite mensal</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">R$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            {...register('amount')}
            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
        {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
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
