'use client'

import { useState, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { createTransaction, createTransfer, updateTransaction } from '@/lib/actions/transactions'
import { suggestCategory, learnRule } from '@/lib/actions/ai-categorization'
import { CurrencyInput } from '@/components/ui/CurrencyInput'
import { CategorySelect } from '@/components/ui/CategorySelect'
import type { Account, Category } from '@/types'
import type { TransactionWithRelations } from '@/lib/actions/transactions'

const transactionSchema = z.object({
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.string().min(1, 'Informe o valor'),
  date: z.string().min(1, 'Informe a data'),
  account_id: z.string().min(1, 'Selecione uma conta'),
  category_id: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  destination_account_id: z.string().optional(),
  transfer_amount: z.string().optional(),
})

type TransactionFormRaw = z.infer<typeof transactionSchema>

interface DuplicateInfo {
  existingId?: string
  date?: string
}

interface TransactionFormProps {
  accounts: Account[]
  categories: Category[]
  defaultType?: 'income' | 'expense' | 'transfer'
  initialValues?: TransactionWithRelations
  transactionId?: string
  onSuccess: () => void
  onCancel: () => void
}

export function TransactionForm({
  accounts,
  categories,
  defaultType = 'expense',
  initialValues,
  transactionId,
  onSuccess,
  onCancel,
}: TransactionFormProps) {
  const isEditing = !!transactionId
  const [serverError, setServerError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null)
  const [pendingData, setPendingData] = useState<TransactionFormRaw | null>(null)
  const [aiSuggestion, setAiSuggestion] = useState<{
    source: 'rule' | 'ai' | 'keyword'
    category_name: string
    category_id: string
  } | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormRaw>({
    resolver: zodResolver(transactionSchema),
    defaultValues: initialValues
      ? {
          type: initialValues.type,
          amount: String(initialValues.amount),
          date: initialValues.date,
          account_id: initialValues.account_id,
          category_id: initialValues.category_id ?? '',
          description: initialValues.description ?? '',
          notes: initialValues.notes ?? '',
          destination_account_id: initialValues.destination_account_id ?? '',
          transfer_amount: initialValues.transfer_amount ? String(initialValues.transfer_amount) : '',
        }
      : {
          type: defaultType,
          date: today,
          amount: '',
          account_id: accounts[0]?.id ?? '',
        },
  })

  const type = watch('type')
  const filteredCategories = categories.filter((c) =>
    type === 'transfer' ? false : c.type === (type === 'income' ? 'income' : 'expense')
  )

  async function triggerSuggest(desc: string) {
    if (!desc.trim() || type === 'transfer') return
    setSuggesting(true)
    try {
      const s = await suggestCategory(desc, null)
      if (s.category_id && (s.confidence === 'high' || s.confidence === 'medium')) {
        const current = watch('category_id')
        if (!current) {
          setValue('category_id', s.category_id)
          setAiSuggestion({ source: s.source, category_name: s.category_name, category_id: s.category_id })
        }
      }
    } catch {
      // suggestion failure is silent
    } finally {
      setSuggesting(false)
    }
  }

  const { onChange: rhfDescOnChange, onBlur: rhfDescOnBlur, ...descRegRest } = register('description')

  function handleDescChange(e: React.ChangeEvent<HTMLInputElement>) {
    rhfDescOnChange(e)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => triggerSuggest(e.target.value), 600)
  }

  function handleDescBlur(e: React.FocusEvent<HTMLInputElement>) {
    rhfDescOnBlur(e)
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    if (e.target.value.trim()) triggerSuggest(e.target.value)
  }

  async function submitForm(data: TransactionFormRaw, force = false) {
    setServerError(null)

    const payload = {
      type: data.type,
      amount: parseFloat(data.amount) || 0,
      date: data.date,
      account_id: data.account_id,
      category_id: data.category_id || null,
      description: data.description || null,
      notes: data.notes || null,
      destination_account_id: data.destination_account_id || null,
      transfer_amount: data.transfer_amount ? parseFloat(data.transfer_amount) : null,
    }

    if (isEditing) {
      const result = await updateTransaction(transactionId!, payload)
      if (result.error) { setServerError(result.error); return }
      if (payload.description && payload.category_id) {
        learnRule(payload.description, payload.category_id, null).catch(() => {})
      }
      onSuccess()
      return
    }

    if (data.type === 'transfer') {
      const result = await createTransfer(payload)
      if (result.error) { setServerError(result.error); return }
      onSuccess()
      return
    }

    const result = await createTransaction({ ...payload, force })

    if (result.duplicate) {
      setPendingData(data)
      setDuplicate({ existingId: result.existingId })
      return
    }

    if (result.error) {
      setServerError(result.error)
      return
    }

    if (payload.description && payload.category_id) {
      learnRule(payload.description, payload.category_id, null).catch(() => {})
    }
    onSuccess()
  }

  async function handleFormSubmit(data: TransactionFormRaw) {
    await submitForm(data, false)
  }

  async function handleForceCreate() {
    if (!pendingData) return
    setDuplicate(null)
    await submitForm(pendingData, true)
  }

  return (
    <>
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
            {(['expense', 'income', 'transfer'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setValue('type', t)}
                className={cn(
                  'flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors',
                  type === t
                    ? t === 'expense'
                      ? 'bg-white text-red-700 shadow-sm'
                      : t === 'income'
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {t === 'expense' ? '↓ Despesa' : t === 'income' ? '↑ Receita' : '⇄ Transferência'}
              </button>
            ))}
          </div>
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

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Data</label>
            <input
              type="date"
              {...register('date')}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
          </div>
        </div>

        {/* Account */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {type === 'transfer' ? 'Conta de origem' : 'Conta'}
          </label>
          <select
            {...register('account_id')}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          >
            <option value="">Selecione uma conta</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
          {errors.account_id && <p className="mt-1 text-xs text-red-600">{errors.account_id.message}</p>}
        </div>

        {/* Destination account (transfer only) */}
        {type === 'transfer' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Conta de destino</label>
              <select
                {...register('destination_account_id')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="">Selecione</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor recebido</label>
              <Controller
                name="transfer_amount"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="Mesmo valor"
                  />
                )}
              />
            </div>
          </div>
        )}

        {/* Description — placed before category so blur can pre-fill it */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Descrição</label>
          <input
            type="text"
            placeholder="Ex: Almoço no restaurante..."
            {...descRegRest}
            onChange={handleDescChange}
            onBlur={handleDescBlur}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        {/* Category (not for transfer) */}
        {type !== 'transfer' && (
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
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Observações <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <textarea
            rows={2}
            placeholder="Notas adicionais..."
            {...register('notes')}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
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
            className={cn(
              'flex-1 flex justify-center items-center gap-2 py-2.5 px-4 text-white text-sm font-medium rounded-lg transition-colors',
              type === 'expense'
                ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400'
                : type === 'income'
                  ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400'
                  : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
            )}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : isEditing ? 'Salvar alterações' : 'Salvar'}
          </button>
        </div>
      </form>

      {/* Duplicate confirmation modal */}
      {duplicate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Possível duplicata detectada</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Identificamos uma transação semelhante já registrada. Deseja registrar mesmo assim?
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setDuplicate(null); setPendingData(null) }}
                className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleForceCreate}
                className="flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Registrar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
