'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, X,
  ChevronLeft, ChevronRight, PieChart,
} from 'lucide-react'
import {
  createBudget,
  updateBudget,
  deleteBudget,
  type BudgetFormData,
  type BudgetWithSpending,
} from '@/lib/actions/budgets'
import { toast } from 'sonner'
import { BudgetForm } from '@/components/forms/BudgetForm'
import { BudgetProgressBar } from '@/components/charts/BudgetProgressBar'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { Category } from '@/types'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

type Modal =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; budget: BudgetWithSpending }
  | { type: 'delete'; budget: BudgetWithSpending }

interface Props {
  budgets: BudgetWithSpending[]
  categories: Category[]
  month: number
  year: number
}

export function BudgetsClient({ budgets, categories, month, year }: Props) {
  const [modal, setModal] = useState<Modal>({ type: 'closed' })
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  function navigate(delta: number) {
    let m = month + delta
    let y = year
    if (m > 12) { m = 1; y++ }
    if (m < 1)  { m = 12; y-- }
    router.push(`/budgets?month=${m}&year=${y}`)
  }

  function refresh() {
    router.refresh()
    setModal({ type: 'closed' })
  }

  async function handleCreate(data: BudgetFormData) {
    const result = await createBudget(data)
    if (!result.error) { toast.success('Orçamento criado!'); refresh() }
    return result
  }

  async function handleUpdate(data: BudgetFormData) {
    if (modal.type !== 'edit') return { error: 'Erro interno' }
    const result = await updateBudget(modal.budget.id, data)
    if (!result.error) { toast.success('Orçamento atualizado!'); refresh() }
    return result
  }

  async function handleDelete() {
    if (modal.type !== 'delete') return
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteBudget(modal.budget.id)
    setDeleting(false)
    if (result.error) {
      setDeleteError(result.error)
    } else {
      toast.success('Orçamento excluído!')
      refresh()
    }
  }

  // Summary
  const totalLimit = budgets.reduce((s, b) => s + b.amount, 0)
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0)
  const overCount = budgets.filter((b) => b.spent > b.amount).length

  // Categories already budgeted (for the create form)
  const budgetedCategoryIds = new Set(budgets.map((b) => b.category_id))
  const availableCategories = categories.filter((c) => !budgetedCategoryIds.has(c.id))

  // Category lookup for the edit form
  const editCategories = (modal.type === 'edit')
    ? categories.filter((c) => !budgetedCategoryIds.has(c.id) || c.id === modal.budget.category_id)
    : []

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Orçamentos</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Controle seus gastos por categoria
            </p>
          </div>
          <button
            onClick={() => setModal({ type: 'create' })}
            disabled={availableCategories.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
            title={availableCategories.length === 0 ? 'Todas as categorias já têm orçamento' : undefined}
          >
            <Plus className="w-4 h-4" />
            Novo orçamento
          </button>
        </div>

        {/* Month navigator */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-5 py-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900">
            {MONTHS[month - 1]} {year}
          </span>
          <button
            onClick={() => navigate(1)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Summary bar */}
        {budgets.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard
              label="Total orçado"
              value={formatCurrency(totalLimit)}
              sub="limite do mês"
              color="gray"
            />
            <SummaryCard
              label="Total gasto"
              value={formatCurrency(totalSpent)}
              sub={`${Math.round(totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0)}% do orçamento`}
              color={totalSpent > totalLimit ? 'red' : totalSpent / totalLimit > 0.7 ? 'amber' : 'emerald'}
            />
            <SummaryCard
              label="Categorias excedidas"
              value={String(overCount)}
              sub={overCount === 0 ? 'tudo sob controle' : overCount === 1 ? '1 categoria' : `${overCount} categorias`}
              color={overCount > 0 ? 'red' : 'emerald'}
            />
          </div>
        )}

        {/* Budget cards */}
        {budgets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
            <PieChart className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">Nenhum orçamento configurado.</p>
            <p className="text-xs text-gray-400 mt-1">Crie orçamentos para controlar seus gastos por categoria.</p>
            <button
              onClick={() => setModal({ type: 'create' })}
              className="mt-4 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Criar primeiro orçamento
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgets.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onEdit={() => setModal({ type: 'edit', budget })}
                onDelete={() => { setDeleteError(null); setModal({ type: 'delete', budget }) }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {modal.type === 'create' && (
        <ModalShell title="Novo orçamento" onClose={() => setModal({ type: 'closed' })}>
          <BudgetForm
            categories={availableCategories}
            isCreate
            onSubmit={handleCreate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Criar orçamento"
          />
        </ModalShell>
      )}

      {/* Edit modal */}
      {modal.type === 'edit' && (
        <ModalShell title="Editar orçamento" onClose={() => setModal({ type: 'closed' })}>
          <BudgetForm
            categories={editCategories}
            defaultValues={{
              category_id: modal.budget.category_id,
              name: modal.budget.name,
              amount: modal.budget.amount,
            }}
            onSubmit={handleUpdate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Salvar alterações"
          />
        </ModalShell>
      )}

      {/* Delete modal */}
      {modal.type === 'delete' && (
        <ModalShell title="Excluir orçamento" onClose={() => setModal({ type: 'closed' })}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Excluir o orçamento{' '}
              <span className="font-semibold text-gray-900">{modal.budget.name}</span>?
            </p>
            {deleteError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-700">{deleteError}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg"
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  )
}

// ─── Budget Card ───────────────────────────────────────────────────────────────

function BudgetCard({
  budget, onEdit, onDelete,
}: {
  budget: BudgetWithSpending
  onEdit: () => void
  onDelete: () => void
}) {
  const isOver = budget.spent > budget.amount
  const remaining = budget.amount - budget.spent

  return (
    <div className="group bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-colors">
      {/* Top row: category + actions */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {/* Category dot / icon */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
            style={{
              backgroundColor: budget.category?.color
                ? `${budget.category.color}18`
                : '#f3f4f6',
            }}
          >
            {budget.category?.icon ?? <PieChart className="w-4 h-4 text-gray-400" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">{budget.name}</p>
            {budget.category && budget.category.name !== budget.name && (
              <p className="text-xs text-gray-400">{budget.category.name}</p>
            )}
          </div>
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <BudgetProgressBar current={budget.spent} limit={budget.amount} label="" />

      {/* Amounts */}
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-400">Gasto</p>
          <p className={cn(
            'text-base font-bold tabular-nums',
            isOver ? 'text-red-600' : 'text-gray-900'
          )}>
            {formatCurrency(budget.spent)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">{isOver ? 'Excedido' : 'Restante'}</p>
          <p className={cn(
            'text-sm font-semibold tabular-nums',
            isOver ? 'text-red-500' : 'text-emerald-600'
          )}>
            {isOver ? `+${formatCurrency(Math.abs(remaining))}` : formatCurrency(remaining)}
          </p>
        </div>
      </div>

      {/* Limit */}
      <p className="mt-1 text-xs text-gray-400 text-right">
        limite: {formatCurrency(budget.amount)}
      </p>
    </div>
  )
}

// ─── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, color,
}: {
  label: string
  value: string
  sub: string
  color: 'gray' | 'emerald' | 'amber' | 'red'
}) {
  const valueColor = {
    gray: 'text-gray-900',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  }[color]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums', valueColor)}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

// ─── Modal Shell ───────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
