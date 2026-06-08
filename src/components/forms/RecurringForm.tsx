'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Bell } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { CurrencyInput } from '@/components/ui/CurrencyInput'
import { CategorySelect } from '@/components/ui/CategorySelect'
import { suggestCategory, learnRule } from '@/lib/actions/ai-categorization'
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
  create_alert: z.boolean(),
  alert_days_before: z.number().int().min(1).max(30),
  alert_end_date: z.string().optional(),
})

type RecurringFormRaw = z.infer<typeof recurringSchema>

export interface RecurringFormValues extends Omit<RecurringFormRaw, 'amount' | 'category_id' | 'end_date' | 'alert_end_date'> {
  amount: number
  category_id?: string | null
  end_date?: string | null
  alert_end_date?: string | null
  remove_alert?: boolean
}

interface AlertSnapshot {
  id: string
  days_before: number
  end_date: string | null
}

interface RecurringFormProps {
  accounts: Account[]
  categories: Category[]
  defaultValues?: Partial<RecurringRule & { bill_alert: AlertSnapshot | null }>
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
  const [removeExistingAlert, setRemoveExistingAlert] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<{
    source: 'rule' | 'ai' | 'keyword'
    category_name: string
    category_id: string
  } | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasExistingAlert = !!defaultValues?.bill_alert
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
      create_alert: hasExistingAlert,
      alert_days_before: defaultValues?.bill_alert?.days_before ?? 3,
      alert_end_date: defaultValues?.bill_alert?.end_date ?? defaultValues?.end_date ?? '',
    },
  })

  const type = watch('type')
  const createAlert = watch('create_alert')
  const filteredCategories = categories.filter((c) => c.type === type)

  useEffect(() => {
    if (createAlert) setRemoveExistingAlert(false)
  }, [createAlert])

  async function triggerSuggest(name: string) {
    if (!name.trim()) return
    setSuggesting(true)
    try {
      const s = await suggestCategory(name, null)
      if (s.category_id && (s.confidence === 'high' || s.confidence === 'medium')) {
        const current = watch('category_id')
        if (!current) {
          setValue('category_id', s.category_id)
          setAiSuggestion({ source: s.source, category_name: s.category_name, category_id: s.category_id })
        }
      }
    } catch {
      // silent
    } finally {
      setSuggesting(false)
    }
  }

  const { onChange: rhfNameOnChange, onBlur: rhfNameOnBlur, ...nameRegRest } = register('name')

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    rhfNameOnChange(e)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => triggerSuggest(e.target.value), 600)
  }

  function handleNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    rhfNameOnBlur(e)
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    if (e.target.value.trim()) triggerSuggest(e.target.value)
  }

  async function handleFormSubmit(raw: RecurringFormRaw) {
    setServerError(null)
    const result = await onSubmit({
      ...raw,
      amount: parseFloat(raw.amount) || 0,
      category_id: raw.category_id || null,
      end_date: raw.end_date || null,
      alert_end_date: raw.alert_end_date || null,
      remove_alert: hasExistingAlert && !raw.create_alert ? removeExistingAlert : undefined,
    })
    if (result.error) { setServerError(result.error); return }

    if (raw.name && raw.category_id) {
      learnRule(raw.name, raw.category_id, null).catch(() => {})
    }
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
          {...nameRegRest}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
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
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-gray-700">Categoria</label>
          {suggesting && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          {!suggesting && aiSuggestion && (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              aiSuggestion.source === 'rule'
                ? 'bg-blue-50 text-blue-600'
                : aiSuggestion.source === 'keyword'
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-purple-50 text-purple-600'
            )}>
              {aiSuggestion.source === 'rule' ? '✓ Regra' : aiSuggestion.source === 'keyword' ? '🔍 Sugestão' : '✨ IA'}
            </span>
          )}
        </div>
        <Controller
          name="category_id"
          control={control}
          render={({ field }) => (
            <CategorySelect
              categories={filteredCategories}
              value={field.value ?? ''}
              onChange={(val) => {
                field.onChange(val)
                if (aiSuggestion && val !== aiSuggestion.category_id) setAiSuggestion(null)
              }}
            />
          )}
        />
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

      {/* Alert toggle */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-3 p-3 bg-gray-50">
          <input
            id="create_alert"
            type="checkbox"
            {...register('create_alert')}
            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <label htmlFor="create_alert" className="flex-1 flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Criar alerta de vencimento</p>
              <p className="text-xs text-gray-400">
                Receber aviso antes do vencimento desta recorrência
              </p>
            </div>
          </label>
        </div>

        {createAlert && (
          <div className="p-3 border-t border-gray-200 space-y-3 bg-white">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Avisar com antecedência (dias)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  {...register('alert_days_before', { valueAsNumber: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                {errors.alert_days_before && (
                  <p className="mt-1 text-xs text-red-600">{errors.alert_days_before.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Término do alerta <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="date"
                  {...register('alert_end_date')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Confirmation when unchecking with existing alert */}
        {hasExistingAlert && !createAlert && (
          <div className="p-3 border-t border-amber-200 bg-amber-50">
            <p className="text-xs text-amber-800 mb-2">
              Existe um alerta associado a esta recorrência. Deseja removê-lo?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRemoveExistingAlert(true)}
                className={cn(
                  'flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors',
                  removeExistingAlert
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                )}
              >
                Sim, remover
              </button>
              <button
                type="button"
                onClick={() => setRemoveExistingAlert(false)}
                className={cn(
                  'flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors',
                  !removeExistingAlert
                    ? 'bg-gray-700 text-white border-gray-700'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                )}
              >
                Manter alerta
              </button>
            </div>
          </div>
        )}
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
