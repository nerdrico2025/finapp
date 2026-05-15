'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, X,
  Bell, BellOff, AlertTriangle, CalendarClock,
  ToggleLeft, ToggleRight,
} from 'lucide-react'
import {
  createBillAlert,
  updateBillAlert,
  toggleBillAlert,
  deleteBillAlert,
  type BillAlertFormData,
  type UpcomingAlert,
} from '@/lib/actions/billAlerts'
import { toast } from 'sonner'
import { BillAlertForm } from '@/components/forms/BillAlertForm'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { BillAlert } from '@/types'

type Modal =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; alert: BillAlert }
  | { type: 'delete'; alert: BillAlert }

interface Props {
  alerts: BillAlert[]
  upcoming: UpcomingAlert[]
}

export function AlertsClient({ alerts, upcoming }: Props) {
  const [modal, setModal] = useState<Modal>({ type: 'closed' })
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  function refresh() {
    router.refresh()
    setModal({ type: 'closed' })
  }

  async function handleCreate(data: BillAlertFormData) {
    const result = await createBillAlert(data)
    if (!result.error) { toast.success('Alerta criado!'); refresh() }
    return result
  }

  async function handleUpdate(data: BillAlertFormData) {
    if (modal.type !== 'edit') return { error: 'Erro interno' }
    const result = await updateBillAlert(modal.alert.id, data)
    if (!result.error) { toast.success('Alerta atualizado!'); refresh() }
    return result
  }

  async function handleToggle(id: string) {
    setToggling(id)
    await toggleBillAlert(id)
    setToggling(null)
    router.refresh()
  }

  async function handleDelete() {
    if (modal.type !== 'delete') return
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteBillAlert(modal.alert.id)
    setDeleting(false)
    if (result.error) {
      setDeleteError(result.error)
    } else {
      toast.success('Alerta excluído!')
      refresh()
    }
  }

  const urgent = upcoming.filter((a) => a.days_until <= 3)
  const upcomingIds = new Set(upcoming.map((a) => a.id))

  // Build a lookup of upcoming data by alert id
  const upcomingMap = new Map(upcoming.map((a) => [a.id, a]))

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Alertas de vencimento</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Receba avisos antes das contas vencerem ({alerts.filter((a) => a.is_active).length} ativos)
            </p>
          </div>
          <button
            onClick={() => setModal({ type: 'create' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo alerta
          </button>
        </div>

        {/* Urgent banner */}
        {urgent.length > 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {urgent.length === 1
                  ? '1 conta vence nos próximos 3 dias'
                  : `${urgent.length} contas vencem nos próximos 3 dias`}
              </p>
              <ul className="mt-1 space-y-0.5">
                {urgent.map((a) => (
                  <li key={a.id} className="text-sm text-amber-800">
                    <span className="font-medium">{a.name}</span>
                    {a.amount != null && <span> · {formatCurrency(a.amount)}</span>}
                    <span className="text-amber-600 ml-1">
                      {a.days_until === 0
                        ? '— vence hoje'
                        : a.days_until === 1
                        ? '— vence amanhã'
                        : `— vence em ${a.days_until} dias`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Alert list */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-semibold text-gray-900">Contas configuradas</h2>
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                {alerts.length}
              </span>
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Nenhum alerta configurado.</p>
              <button
                onClick={() => setModal({ type: 'create' })}
                className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Adicionar primeiro alerta
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {alerts.map((alert) => {
                const up = upcomingMap.get(alert.id)
                return (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    upcoming={up}
                    toggling={toggling === alert.id}
                    onEdit={() => setModal({ type: 'edit', alert })}
                    onDelete={() => { setDeleteError(null); setModal({ type: 'delete', alert }) }}
                    onToggle={() => handleToggle(alert.id)}
                  />
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Create modal */}
      {modal.type === 'create' && (
        <ModalShell title="Novo alerta" onClose={() => setModal({ type: 'closed' })}>
          <BillAlertForm
            onSubmit={handleCreate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Criar alerta"
          />
        </ModalShell>
      )}

      {/* Edit modal */}
      {modal.type === 'edit' && (
        <ModalShell title="Editar alerta" onClose={() => setModal({ type: 'closed' })}>
          <BillAlertForm
            defaultValues={modal.alert}
            onSubmit={handleUpdate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Salvar alterações"
          />
        </ModalShell>
      )}

      {/* Delete modal */}
      {modal.type === 'delete' && (
        <ModalShell title="Excluir alerta" onClose={() => setModal({ type: 'closed' })}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Excluir o alerta{' '}
              <span className="font-semibold text-gray-900">{modal.alert.name}</span>?
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

// ─── Alert Item ────────────────────────────────────────────────────────────────

function AlertItem({
  alert, upcoming, toggling, onEdit, onDelete, onToggle,
}: {
  alert: BillAlert
  upcoming: UpcomingAlert | undefined
  toggling: boolean
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const urgencyLabel =
    upcoming == null ? null :
    upcoming.days_until === 0 ? 'Hoje' :
    upcoming.days_until === 1 ? 'Amanhã' :
    `${upcoming.days_until}d`

  const urgencyColor =
    upcoming == null ? null :
    upcoming.days_until <= 1 ? 'bg-red-100 text-red-700' :
    upcoming.days_until <= 3 ? 'bg-amber-100 text-amber-700' :
    'bg-blue-100 text-blue-700'

  return (
    <li className={cn(
      'flex items-center gap-3 px-5 py-3.5 group transition-colors',
      alert.is_active ? 'hover:bg-gray-50' : 'opacity-50 hover:bg-gray-50'
    )}>
      {/* Icon */}
      <div className={cn(
        'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
        alert.is_active ? 'bg-emerald-50' : 'bg-gray-100'
      )}>
        {alert.is_active
          ? <Bell className="w-4 h-4 text-emerald-500" />
          : <BellOff className="w-4 h-4 text-gray-400" />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{alert.name}</p>
          {urgencyLabel && urgencyColor && (
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0', urgencyColor)}>
              {urgencyLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <CalendarClock className="w-3 h-3" />
            Dia {alert.day_of_month} de cada mês
          </span>
          <span>·</span>
          <span>Avisar {alert.days_before}d antes</span>
          {alert.amount != null && (
            <>
              <span>·</span>
              <span className="text-red-500 font-medium">{formatCurrency(alert.amount)}</span>
            </>
          )}
        </div>
      </div>

      {/* Toggle */}
      <button
        onClick={onToggle}
        disabled={toggling}
        className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 shrink-0"
        title={alert.is_active ? 'Desativar' : 'Ativar'}
      >
        {alert.is_active
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
