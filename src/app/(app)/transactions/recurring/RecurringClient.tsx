'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, X,
  TrendingUp, TrendingDown, RefreshCw,
  CalendarClock, ToggleLeft, ToggleRight,
} from 'lucide-react'
import {
  createRecurringRule,
  updateRecurringRule,
  toggleRecurringRule,
  deleteRecurringRule,
} from '@/lib/actions/recurring'
import { toast } from 'sonner'
import { RecurringForm, FREQUENCY_LABELS, type RecurringFormValues } from '@/components/forms/RecurringForm'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { Account, Category, RecurringRule } from '@/types'

type RuleWithRelations = RecurringRule & {
  account: { id: string; name: string; color: string | null } | null
  category: { id: string; name: string; icon: string | null; color: string | null } | null
}

type Modal =
  | { type: 'closed' }
  | { type: 'create'; ruleType: 'income' | 'expense' }
  | { type: 'edit'; rule: RuleWithRelations }
  | { type: 'delete'; rule: RuleWithRelations }

interface Props {
  rules: RuleWithRelations[]
  accounts: Account[]
  categories: Category[]
}

export function RecurringClient({ rules, accounts, categories }: Props) {
  const [modal, setModal] = useState<Modal>({ type: 'closed' })
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  function refresh() {
    router.refresh()
    setModal({ type: 'closed' })
  }

  async function handleCreate(data: RecurringFormValues) {
    const result = await createRecurringRule(data)
    if (!result.error) { toast.success('Recorrência criada!'); refresh() }
    return result
  }

  async function handleUpdate(data: RecurringFormValues) {
    if (modal.type !== 'edit') return { error: 'Erro interno' }
    const result = await updateRecurringRule(modal.rule.id, data)
    if (!result.error) { toast.success('Recorrência atualizada!'); refresh() }
    return result
  }

  async function handleToggle(id: string) {
    setToggling(id)
    await toggleRecurringRule(id)
    setToggling(null)
    router.refresh()
  }

  async function handleDelete() {
    if (modal.type !== 'delete') return
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteRecurringRule(modal.rule.id)
    setDeleting(false)
    if (result.error) {
      setDeleteError(result.error)
    } else {
      toast.success('Recorrência excluída!')
      refresh()
    }
  }

  const incomeRules = rules.filter((r) => r.type === 'income')
  const expenseRules = rules.filter((r) => r.type === 'expense')

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Recorrências</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Gastos e entradas automáticos ({rules.filter((r) => r.is_active).length} ativos)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RuleSection
            title="Despesas recorrentes"
            icon={<TrendingDown className="w-4 h-4 text-red-500" />}
            accent="red"
            rules={expenseRules}
            toggling={toggling}
            onAdd={() => setModal({ type: 'create', ruleType: 'expense' })}
            onEdit={(r) => setModal({ type: 'edit', rule: r })}
            onDelete={(r) => { setDeleteError(null); setModal({ type: 'delete', rule: r }) }}
            onToggle={handleToggle}
          />

          <RuleSection
            title="Receitas recorrentes"
            icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
            accent="green"
            rules={incomeRules}
            toggling={toggling}
            onAdd={() => setModal({ type: 'create', ruleType: 'income' })}
            onEdit={(r) => setModal({ type: 'edit', rule: r })}
            onDelete={(r) => { setDeleteError(null); setModal({ type: 'delete', rule: r }) }}
            onToggle={handleToggle}
          />
        </div>
      </div>

      {modal.type === 'create' && (
        <Modal
          title={`Nova ${modal.ruleType === 'expense' ? 'despesa' : 'receita'} recorrente`}
          onClose={() => setModal({ type: 'closed' })}
        >
          <RecurringForm
            accounts={accounts}
            categories={categories}
            defaultValues={{ type: modal.ruleType }}
            onSubmit={handleCreate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Criar recorrência"
          />
        </Modal>
      )}

      {modal.type === 'edit' && (
        <Modal title="Editar recorrência" onClose={() => setModal({ type: 'closed' })}>
          <RecurringForm
            accounts={accounts}
            categories={categories}
            defaultValues={modal.rule}
            onSubmit={handleUpdate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Salvar alterações"
          />
        </Modal>
      )}

      {modal.type === 'delete' && (
        <Modal title="Excluir recorrência" onClose={() => setModal({ type: 'closed' })}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Excluir a regra{' '}
              <span className="font-semibold text-gray-900">{modal.rule.name}</span>?
              As transações já geradas não serão afetadas.
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
        </Modal>
      )}
    </>
  )
}

// ─── Rule Section ──────────────────────────────────────────────────────────────

function RuleSection({
  title, icon, accent, rules, toggling,
  onAdd, onEdit, onDelete, onToggle,
}: {
  title: string
  icon: React.ReactNode
  accent: 'red' | 'green'
  rules: RuleWithRelations[]
  toggling: string | null
  onAdd: () => void
  onEdit: (r: RuleWithRelations) => void
  onDelete: (r: RuleWithRelations) => void
  onToggle: (id: string) => void
}) {
  const monthlyTotal = rules
    .filter((r) => r.is_active)
    .reduce((sum, r) => {
      const monthly =
        r.frequency === 'daily'     ? r.amount * 30 :
        r.frequency === 'weekly'    ? r.amount * 4.3 :
        r.frequency === 'biweekly'  ? r.amount * 2.15 :
        r.frequency === 'monthly'   ? r.amount :
        r.frequency === 'quarterly' ? r.amount / 3 :
        r.frequency === 'yearly'    ? r.amount / 12 : r.amount
      return sum + monthly
    }, 0)

  return (
    <div className="bg-white rounded-2xl border border-gray-100">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
            {rules.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {rules.length > 0 && (
            <span className="text-xs text-gray-400">
              ~{formatCurrency(monthlyTotal)}/mês
            </span>
          )}
          <button
            onClick={onAdd}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              accent === 'red'
                ? 'bg-red-50 text-red-700 hover:bg-red-100'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            Nova
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="py-10 text-center text-gray-400">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">Nenhuma recorrência cadastrada.</p>
          <button onClick={onAdd} className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
            Adicionar primeira
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {rules.map((rule) => (
            <RuleItem
              key={rule.id}
              rule={rule}
              toggling={toggling === rule.id}
              onEdit={() => onEdit(rule)}
              onDelete={() => onDelete(rule)}
              onToggle={() => onToggle(rule.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Rule Item ─────────────────────────────────────────────────────────────────

function RuleItem({
  rule, toggling, onEdit, onDelete, onToggle,
}: {
  rule: RuleWithRelations
  toggling: boolean
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = rule.is_active && rule.next_date < today
  const isDueToday = rule.is_active && rule.next_date === today

  return (
    <li className={cn(
      'flex items-center gap-3 px-5 py-3.5 group transition-colors',
      rule.is_active ? 'hover:bg-gray-50' : 'opacity-50 hover:bg-gray-50'
    )}>
      {/* Icon / color dot */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
        style={{
          backgroundColor: rule.category?.color
            ? `${rule.category.color}18`
            : '#f3f4f6',
        }}
      >
        {rule.category?.icon ?? <RefreshCw className="w-4 h-4 text-gray-400" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{rule.name}</p>
          {(isOverdue || isDueToday) && rule.is_active && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0',
              isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            )}>
              {isOverdue ? 'Vencido' : 'Hoje'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
          <span>{FREQUENCY_LABELS[rule.frequency]}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <CalendarClock className="w-3 h-3" />
            {formatDate(rule.next_date)}
          </span>
          {rule.account && <><span>·</span><span>{rule.account.name}</span></>}
        </div>
      </div>

      {/* Amount */}
      <p className={cn(
        'text-sm font-semibold shrink-0 tabular-nums',
        rule.type === 'income' ? 'text-emerald-600' : 'text-red-600'
      )}>
        {formatCurrency(rule.amount)}
      </p>

      {/* Toggle */}
      <button
        onClick={onToggle}
        disabled={toggling}
        className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 shrink-0"
        title={rule.is_active ? 'Desativar' : 'Ativar'}
      >
        {rule.is_active
          ? <ToggleRight className="w-5 h-5 text-emerald-500" />
          : <ToggleLeft className="w-5 h-5" />
        }
      </button>

      {/* Actions */}
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
    </li>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

function Modal({
  title, onClose, children,
}: {
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
