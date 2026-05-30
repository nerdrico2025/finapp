'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useCallback } from 'react'
import {
  Plus, Upload, ChevronLeft, ChevronRight, Trash2, Pencil,
  ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { deleteTransaction } from '@/lib/actions/transactions'
import { TransactionForm } from '@/components/forms/TransactionForm'
import { ImportCSVForm } from '@/components/forms/ImportCSVForm'
import { cn } from '@/lib/utils/cn'
import type { Account, Category, TransactionType } from '@/types'
import type { TransactionWithRelations } from '@/lib/actions/transactions'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const TYPE_LABELS: Record<string, string> = {
  all: 'Todos os tipos',
  income: 'Receitas',
  expense: 'Despesas',
  transfer: 'Transferências',
}

interface Filters {
  month: number
  year: number
  type: TransactionType | 'all'
  categoryId?: string
  accountId?: string
  page: number
}

interface Props {
  transactions: TransactionWithRelations[]
  totalCount: number
  accounts: Account[]
  categories: Category[]
  filters: Filters
  totalIncome: number
  totalExpenses: number
}

type Modal = 'closed' | 'create' | 'import' | 'edit'

export function TransactionsClient({
  transactions,
  totalCount,
  accounts,
  categories,
  filters,
  totalIncome,
  totalExpenses,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [modal, setModal] = useState<Modal>('closed')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingTx, setEditingTx] = useState<TransactionWithRelations | null>(null)

  function openEdit(tx: TransactionWithRelations) {
    setEditingTx(tx)
    setModal('edit')
  }

  function closeEdit() {
    setModal('closed')
    setEditingTx(null)
  }

  const PAGE_SIZE = 20
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  function pushFilters(updates: Partial<Filters>) {
    const next = { ...filters, ...updates, page: updates.page ?? 1 }
    const params = new URLSearchParams()
    params.set('month', String(next.month))
    params.set('year', String(next.year))
    if (next.type !== 'all') params.set('type', next.type)
    if (next.categoryId) params.set('categoryId', next.categoryId)
    if (next.accountId) params.set('accountId', next.accountId)
    if (next.page > 1) params.set('page', String(next.page))
    router.push(`${pathname}?${params.toString()}`)
  }

  async function handleDelete(tx: TransactionWithRelations) {
    const msg = tx.transfer_pair_id
      ? 'Excluir esta transferência? Ambos os registros (origem e destino) serão removidos e os saldos revertidos.'
      : 'Excluir esta transação? O saldo da conta será revertido.'
    if (!confirm(msg)) return
    setDeletingId(tx.id)
    await deleteTransaction(tx.id)
    setDeletingId(null)
    toast.success(tx.transfer_pair_id ? 'Transferência excluída!' : 'Transação excluída!')
    router.refresh()
  }

  const incomeTotal = totalIncome
  const expenseTotal = totalExpenses

  const yearsRange = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Transações</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {totalCount} transações em {MONTHS[filters.month - 1]} {filters.year}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setModal('import')}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Importar
            </button>
            <button
              onClick={() => setModal('create')}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova transação
            </button>
          </div>
        </div>

        {/* Month/Year nav + summary */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Month navigator */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const prev = filters.month === 1
                    ? { month: 12, year: filters.year - 1 }
                    : { month: filters.month - 1, year: filters.year }
                  pushFilters(prev)
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex gap-1.5">
                <select
                  value={filters.month}
                  onChange={(e) => pushFilters({ month: parseInt(e.target.value) })}
                  className="px-2 py-1 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  value={filters.year}
                  onChange={(e) => pushFilters({ year: parseInt(e.target.value) })}
                  className="px-2 py-1 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {yearsRange.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  const next = filters.month === 12
                    ? { month: 1, year: filters.year + 1 }
                    : { month: filters.month + 1, year: filters.year }
                  pushFilters(next)
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="w-px h-6 bg-gray-100" />

            {/* Summary pills */}
            <div className="flex gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                <ArrowUpCircle className="w-3.5 h-3.5" />
                {formatCurrency(incomeTotal)}
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                <ArrowDownCircle className="w-3.5 h-3.5" />
                {formatCurrency(expenseTotal)}
              </span>
              <span className={cn(
                'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                incomeTotal - expenseTotal >= 0
                  ? 'text-gray-700 bg-gray-100'
                  : 'text-red-700 bg-red-50'
              )}>
                = {formatCurrency(incomeTotal - expenseTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex gap-2 flex-wrap">
          <select
            value={filters.type}
            onChange={(e) => pushFilters({ type: e.target.value as TransactionType | 'all' })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          <select
            value={filters.categoryId ?? ''}
            onChange={(e) => pushFilters({ categoryId: e.target.value || undefined })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>

          <select
            value={filters.accountId ?? ''}
            onChange={(e) => pushFilters({ accountId: e.target.value || undefined })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          {(filters.type !== 'all' || filters.categoryId || filters.accountId) && (
            <button
              onClick={() => pushFilters({ type: 'all', categoryId: undefined, accountId: undefined })}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Limpar filtros
            </button>
          )}
        </div>

        {/* Transactions list */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {transactions.length === 0 ? (
            <div className="py-16 text-center">
              <ArrowLeftRight className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Nenhuma transação encontrada.</p>
              <button
                onClick={() => setModal('create')}
                className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Adicionar transação
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {transactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  deleting={deletingId === tx.id}
                  onDelete={() => handleDelete(tx)}
                  onEdit={() => openEdit(tx)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Página {filters.page} de {totalPages} · {totalCount} transações
            </p>
            <div className="flex gap-2">
              <button
                disabled={filters.page <= 1}
                onClick={() => pushFilters({ page: filters.page - 1 })}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Anterior
              </button>
              <button
                disabled={filters.page >= totalPages}
                onClick={() => pushFilters({ page: filters.page + 1 })}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {modal === 'create' && (
        <Modal title="Nova transação" onClose={() => setModal('closed')} wide>
          <TransactionForm
            accounts={accounts}
            categories={categories}
            onSuccess={() => { toast.success('Transação criada!'); setModal('closed'); router.refresh() }}
            onCancel={() => setModal('closed')}
          />
        </Modal>
      )}

      {/* Import modal */}
      {modal === 'import' && (
        <Modal title="Importar transações" onClose={() => setModal('closed')} extraWide>
          <ImportCSVForm
            accounts={accounts}
            categories={categories}
            onSuccess={() => { toast.success('Transações importadas!'); setModal('closed'); router.refresh() }}
            onCancel={() => setModal('closed')}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {modal === 'edit' && editingTx && (
        <Modal title="Editar transação" onClose={closeEdit} wide>
          <TransactionForm
            accounts={accounts}
            categories={categories}
            initialValues={editingTx}
            transactionId={editingTx.id}
            onSuccess={() => { toast.success('Transação atualizada!'); closeEdit(); router.refresh() }}
            onCancel={closeEdit}
          />
        </Modal>
      )}
    </>
  )
}

// ─── Transaction Row ───────────────────────────────────────────────────────────

function TransactionRow({
  tx,
  deleting,
  onDelete,
  onEdit,
}: {
  tx: TransactionWithRelations
  deleting: boolean
  onDelete: () => void
  onEdit: () => void
}) {
  const isIncome = tx.type === 'income'
  const isTransfer = tx.type === 'transfer'
  // Mirror = incoming transfer (credit side); Primary = outgoing (debit side)
  const isTransferIn = isTransfer && tx.is_mirror
  const otherAccount = isTransfer ? tx.destination_account : null

  return (
    <li className="flex items-center gap-3 px-5 py-3.5 group hover:bg-gray-50 transition-colors">
      {/* Type icon */}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
        isIncome ? 'bg-emerald-100' : isTransfer ? 'bg-blue-100' : 'bg-red-100'
      )}>
        {isIncome
          ? <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
          : isTransfer
            ? <ArrowLeftRight className="w-4 h-4 text-blue-600" />
            : <ArrowDownCircle className="w-4 h-4 text-red-600" />
        }
      </div>

      {/* Date */}
      <p className="text-xs text-gray-400 w-20 shrink-0">{formatDate(tx.date)}</p>

      {/* Description + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {tx.description ?? (isTransfer ? 'Transferência' : tx.type === 'income' ? 'Receita' : 'Despesa')}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {isTransfer ? (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600">
              {isTransferIn
                ? `← ${otherAccount?.name ?? tx.account?.name ?? 'Transferência'}`
                : `→ ${otherAccount?.name ?? 'Transferência'}`}
            </span>
          ) : (
            <>
              {tx.category && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: tx.category.color ? `${tx.category.color}18` : '#f3f4f6',
                    color: tx.category.color ?? '#6b7280',
                  }}
                >
                  {tx.category.icon} {tx.category.name}
                </span>
              )}
              {tx.account && (
                <span className="text-xs text-gray-400">{tx.account.name}</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Amount */}
      <p className={cn(
        'text-sm font-semibold shrink-0 tabular-nums',
        isIncome || isTransferIn ? 'text-emerald-600' : isTransfer ? 'text-red-500' : 'text-red-600'
      )}>
        {isIncome || isTransferIn ? '+' : '-'}{formatCurrency(tx.amount)}
      </p>

      {/* Actions */}
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
  wide,
  extraWide,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
  extraWide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        'relative bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto',
        extraWide ? 'w-full max-w-3xl' : wide ? 'w-full max-w-lg' : 'w-full max-w-md'
      )}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
