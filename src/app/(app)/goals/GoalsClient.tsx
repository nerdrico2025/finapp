'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Target, X, Loader2, CheckCircle2 } from 'lucide-react'
import {
  createGoal,
  updateGoal,
  contributeToGoal,
  completeGoal,
  deleteGoal,
  type GoalFormData,
  type GoalWithProgress,
} from '@/lib/actions/goals'
import { toast } from 'sonner'
import { GoalForm } from '@/components/forms/GoalForm'
import { GoalCard } from '@/components/ui/GoalCard'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

type Modal =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; goal: GoalWithProgress }
  | { type: 'contribute'; goal: GoalWithProgress }
  | { type: 'delete'; goal: GoalWithProgress }

interface Props {
  goals: GoalWithProgress[]
}

export function GoalsClient({ goals }: Props) {
  const [modal, setModal] = useState<Modal>({ type: 'closed' })
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  function refresh() {
    router.refresh()
    setModal({ type: 'closed' })
  }

  async function handleCreate(data: GoalFormData) {
    const result = await createGoal(data)
    if (!result.error) { toast.success('Meta criada!'); refresh() }
    return result
  }

  async function handleUpdate(data: GoalFormData) {
    if (modal.type !== 'edit') return { error: 'Erro interno' }
    const result = await updateGoal(modal.goal.id, data)
    if (!result.error) { toast.success('Meta atualizada!'); refresh() }
    return result
  }

  async function handleComplete(id: string) {
    await completeGoal(id)
    toast.success('Meta concluída!')
    router.refresh()
  }

  async function handleDelete() {
    if (modal.type !== 'delete') return
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteGoal(modal.goal.id)
    setDeleting(false)
    if (result.error) {
      setDeleteError(result.error)
    } else {
      toast.success('Meta excluída!')
      refresh()
    }
  }

  const activeGoals = goals.filter((g) => g.status === 'active')
  const completedGoals = goals.filter((g) => g.status === 'completed')

  const totalTarget = activeGoals.reduce((s, g) => s + g.target_amount, 0)
  const totalSaved = activeGoals.reduce((s, g) => s + g.current_amount, 0)

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Metas</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Acompanhe suas metas de economia
            </p>
          </div>
          <button
            onClick={() => setModal({ type: 'create' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova meta
          </button>
        </div>

        {/* Summary */}
        {activeGoals.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Metas ativas" value={String(activeGoals.length)} />
            <SummaryCard label="Total economizado" value={formatCurrency(totalSaved)} highlight="emerald" />
            <SummaryCard label="Total das metas" value={formatCurrency(totalTarget)} />
          </div>
        )}

        {/* Active goals */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-500" />
            Metas ativas
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 font-normal">
              {activeGoals.length}
            </span>
          </h2>

          {activeGoals.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-14 text-center">
              <Target className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium text-gray-500">Nenhuma meta ativa.</p>
              <p className="text-xs text-gray-400 mt-1">Crie uma meta para começar a acompanhar sua economia.</p>
              <button
                onClick={() => setModal({ type: 'create' })}
                className="mt-4 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Criar primeira meta
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onContribute={() => setModal({ type: 'contribute', goal })}
                  onEdit={() => setModal({ type: 'edit', goal })}
                  onDelete={() => { setDeleteError(null); setModal({ type: 'delete', goal }) }}
                  onComplete={() => handleComplete(goal.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Completed goals */}
        {completedGoals.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Concluídas
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 font-normal">
                {completedGoals.length}
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onContribute={() => {}}
                  onEdit={() => setModal({ type: 'edit', goal })}
                  onDelete={() => { setDeleteError(null); setModal({ type: 'delete', goal }) }}
                  onComplete={() => {}}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Create modal */}
      {modal.type === 'create' && (
        <ModalShell title="Nova meta" onClose={() => setModal({ type: 'closed' })}>
          <GoalForm
            onSubmit={handleCreate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Criar meta"
          />
        </ModalShell>
      )}

      {/* Edit modal */}
      {modal.type === 'edit' && (
        <ModalShell title="Editar meta" onClose={() => setModal({ type: 'closed' })}>
          <GoalForm
            defaultValues={modal.goal}
            onSubmit={handleUpdate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Salvar alterações"
          />
        </ModalShell>
      )}

      {/* Contribute modal */}
      {modal.type === 'contribute' && (
        <ModalShell title="Contribuir para a meta" onClose={() => setModal({ type: 'closed' })}>
          <ContributeForm
            goal={modal.goal}
            onSuccess={refresh}
            onCancel={() => setModal({ type: 'closed' })}
          />
        </ModalShell>
      )}

      {/* Delete modal */}
      {modal.type === 'delete' && (
        <ModalShell title="Excluir meta" onClose={() => setModal({ type: 'closed' })}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Excluir a meta{' '}
              <span className="font-semibold text-gray-900">{modal.goal.name}</span>?
              Todo o progresso será perdido.
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

// ─── Contribute Form ───────────────────────────────────────────────────────────

function ContributeForm({
  goal, onSuccess, onCancel,
}: {
  goal: GoalWithProgress
  onSuccess: () => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const remaining = goal.target_amount - goal.current_amount
  const value = parseFloat(amount) || 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (value <= 0) { setError('Informe um valor maior que zero'); return }
    setLoading(true)
    setError(null)
    const result = await contributeToGoal(goal.id, value)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else if (result.completed) {
      setCompleted(true)
      setTimeout(onSuccess, 1800)
    } else {
      toast.success('Contribuição registrada!')
      onSuccess()
    }
  }

  if (completed) {
    return (
      <div className="py-6 text-center space-y-3">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <p className="text-base font-semibold text-gray-900">Meta concluída!</p>
        <p className="text-sm text-gray-500">{goal.name} foi atingida. Parabéns!</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Goal info */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Guardado</span>
          <span className="font-semibold text-gray-900">{formatCurrency(goal.current_amount)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Meta</span>
          <span className="font-semibold text-gray-900">{formatCurrency(goal.target_amount)}</span>
        </div>
        <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
          <span className="text-gray-500">Faltam</span>
          <span className="font-semibold text-emerald-600">{formatCurrency(remaining > 0 ? remaining : 0)}</span>
        </div>
      </div>

      {/* Amount input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Quanto deseja adicionar?</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">R$</span>
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            min="0.01"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
        {value > 0 && (
          <p className="mt-1.5 text-xs text-gray-500">
            Novo total:{' '}
            <span className={cn(
              'font-semibold',
              goal.current_amount + value >= goal.target_amount ? 'text-emerald-600' : 'text-gray-900'
            )}>
              {formatCurrency(goal.current_amount + value)}
            </span>
            {goal.current_amount + value >= goal.target_amount && ' 🎉 meta atingida!'}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || value <= 0}
          className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Contribuir'}
        </button>
      </div>
    </form>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, highlight }: {
  label: string
  value: string
  highlight?: 'emerald'
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={cn(
        'text-xl font-bold',
        highlight === 'emerald' ? 'text-emerald-600' : 'text-gray-900'
      )}>
        {value}
      </p>
    </div>
  )
}

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
