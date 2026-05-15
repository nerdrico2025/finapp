'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { createTransaction } from '@/lib/actions/transactions'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import type { Account, Category } from '@/types'

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
  onSuccess: () => void
  onCancel: () => void
}

export function TransactionForm({
  accounts,
  categories,
  defaultType = 'expense',
  onSuccess,
  onCancel,
}: TransactionFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null)
  const [pendingData, setPendingData] = useState<TransactionFormRaw | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormRaw>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
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

  async function submitForm(data: TransactionFormRaw, force = false) {
    setServerError(null)

    const result = await createTransaction({
      type: data.type,
      amount: parseFloat(data.amount) || 0,
      date: data.date,
      account_id: data.account_id,
      category_id: data.category_id || null,
      description: data.description || null,
      notes: data.notes || null,
      destination_account_id: data.destination_account_id || null,
      transfer_amount: data.transfer_amount ? parseFloat(data.transfer_amount) : null,
      force,
    })

    if (result.duplicate) {
      setPendingData(data)
      setDuplicate({ existingId: result.existingId })
      return
    }

    if (result.error) {
      setServerError(result.error)
      return
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
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Mesmo valor"
                  {...register('transfer_amount')}
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Category (not for transfer) */}
        {type !== 'transfer' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Categoria</label>
            <select
              {...register('category_id')}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">Sem categoria</option>
              {filteredCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Descrição</label>
          <input
            type="text"
            placeholder="Ex: Almoço no restaurante..."
            {...register('description')}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

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
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
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
