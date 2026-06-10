'use client'

import { useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Wallet,
  CreditCard,
  TrendingUp,
  Banknote,
  Building2,
  CircleDollarSign,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils/format'
import { createAccount, updateAccount, deleteAccount } from '@/lib/actions/accounts'
import { AccountForm, type AccountFormValues } from '@/components/forms/AccountForm'
import { UpgradePrompt } from '@/components/ui/UpgradePrompt'
import { cn } from '@/lib/utils/cn'
import type { Account, AccountType } from '@/types'
import { useRouter } from 'next/navigation'

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta Corrente',
  savings: 'Poupança',
  credit_card: 'Cartão de Crédito',
  investment: 'Investimentos',
  wallet: 'Dinheiro',
  other: 'Outro',
}

function AccountIcon({ type, className }: { type: AccountType; className?: string }) {
  const props = { className: cn('w-5 h-5', className) }
  switch (type) {
    case 'checking': return <Building2 {...props} />
    case 'savings': return <Banknote {...props} />
    case 'credit_card': return <CreditCard {...props} />
    case 'investment': return <TrendingUp {...props} />
    case 'wallet': return <Wallet {...props} />
    default: return <CircleDollarSign {...props} />
  }
}

interface Props {
  accounts: Account[]
  totalBalance: number
}

type ModalState =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; account: Account }
  | { type: 'delete'; account: Account }

export function AccountsClient({ accounts, totalBalance: total }: Props) {
  const [modal, setModal] = useState<ModalState>({ type: 'closed' })
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [upgradePrompt, setUpgradePrompt] = useState<{ feature: string; message: string } | null>(null)
  const router = useRouter()

  function refreshPage() {
    router.refresh()
    setModal({ type: 'closed' })
  }

  async function handleCreate(data: AccountFormValues) {
    const result = await createAccount(data)
    if (result.error === 'LIMIT_REACHED') {
      setUpgradePrompt({ feature: result.feature!, message: result.message! })
      return { error: null }
    }
    if (!result.error) { toast.success('Conta criada!'); refreshPage() }
    return result
  }

  async function handleUpdate(data: AccountFormValues) {
    if (modal.type !== 'edit') return { error: 'Erro interno' }
    const result = await updateAccount(modal.account.id, data)
    if (!result.error) { toast.success('Conta atualizada!'); refreshPage() }
    return result
  }

  async function handleDelete() {
    if (modal.type !== 'delete') return
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteAccount(modal.account.id)
    setDeleting(false)
    if (result.error) {
      setDeleteError(result.error)
    } else {
      toast.success('Conta excluída!')
      refreshPage()
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Contas</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Saldo total:{' '}
              <span className={cn('font-semibold', total >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {formatCurrency(total)}
              </span>
            </p>
          </div>
          <button
            onClick={() => setModal({ type: 'create' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova conta
          </button>
        </div>

        {/* Grid */}
        {accounts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma conta cadastrada ainda.</p>
            <button
              onClick={() => setModal({ type: 'create' })}
              className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Adicionar primeira conta
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={() => setModal({ type: 'edit', account })}
                onDelete={() => {
                  setDeleteError(null)
                  setModal({ type: 'delete', account })
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upgrade nudge (shown above any open modal) */}
      {upgradePrompt && (
        <div className="fixed inset-x-4 top-4 z-[60] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-sm">
          <UpgradePrompt
            feature={upgradePrompt.feature as 'accounts'}
            message={upgradePrompt.message}
            onClose={() => setUpgradePrompt(null)}
          />
        </div>
      )}

      {/* Create Modal */}
      {modal.type === 'create' && (
        <Modal title="Nova conta" onClose={() => setModal({ type: 'closed' })}>
          <AccountForm
            onSubmit={handleCreate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Criar conta"
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {modal.type === 'edit' && (
        <Modal title="Editar conta" onClose={() => setModal({ type: 'closed' })}>
          <AccountForm
            defaultValues={modal.account}
            onSubmit={handleUpdate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Salvar alterações"
          />
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {modal.type === 'delete' && (
        <Modal title="Excluir conta" onClose={() => setModal({ type: 'closed' })}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Tem certeza que deseja excluir a conta{' '}
              <span className="font-semibold text-gray-900">{modal.account.name}</span>?
              Esta ação não pode ser desfeita.
            </p>
            {deleteError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-700">{deleteError}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors"
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

// ─── Account Card ──────────────────────────────────────────────────────────────

function AccountCard({
  account,
  onEdit,
  onDelete,
}: {
  account: Account
  onEdit: () => void
  onDelete: () => void
}) {
  const isNegative = account.balance < 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: account.color ? `${account.color}20` : '#10b98120' }}
        >
          <AccountIcon
            type={account.type}
            className="w-5 h-5"
            // inline style for dynamic color
          />
        </div>
        <div className="flex gap-1">
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

      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
          {ACCOUNT_TYPE_LABELS[account.type]}
        </p>
        <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{account.name}</p>
      </div>

      <div>
        <p className="text-xs text-gray-400 mb-0.5">Saldo</p>
        <p className={cn('text-xl font-bold', isNegative ? 'text-red-600' : 'text-gray-900')}>
          {formatCurrency(account.balance)}
        </p>
      </div>

      {account.color && (
        <div
          className="h-1 rounded-full -mx-5 -mb-5 mt-auto"
          style={{ backgroundColor: account.color }}
        />
      )}
    </div>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
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
