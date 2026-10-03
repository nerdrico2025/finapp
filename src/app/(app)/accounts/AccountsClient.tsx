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
  ChevronDown,
  Archive,
  RotateCcw,
  Loader2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils/format'
import { createAccount, updateAccount, deleteAccount, getAccountUsage, setAccountActive } from '@/lib/actions/accounts'
import { AccountForm, type AccountFormValues } from '@/components/forms/AccountForm'
import { UpgradePrompt } from '@/components/ui/UpgradePrompt'
import { cn } from '@/lib/utils/cn'
import { groupAccountsBySection } from '@/lib/accounts/balance'
import { hasMovement, type AccountUsage } from '@/lib/accounts/usage'
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
  inactiveAccounts: Account[]
  totalBalance: number
}

type ModalState =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; account: Account }
  | { type: 'delete'; account: Account }

export function AccountsClient({ accounts, inactiveAccounts, totalBalance: total }: Props) {
  const [modal, setModal] = useState<ModalState>({ type: 'closed' })
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [upgradePrompt, setUpgradePrompt] = useState<{ feature: string; message: string } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['inactive']))
  // Movimentação da conta do modal de exclusão: undefined = carregando.
  const [usage, setUsage] = useState<AccountUsage | null | undefined>(undefined)
  const [deactivating, setDeactivating] = useState(false)
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)
  const router = useRouter()
  const sections = groupAccountsBySection(accounts)

  function toggleSection(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

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

  async function openDelete(account: Account) {
    setDeleteError(null)
    setUsage(undefined)
    setModal({ type: 'delete', account })
    const res = await getAccountUsage(account.id)
    if (res.error) setDeleteError(res.error)
    setUsage(res.usage)
  }

  async function handleDeactivate() {
    if (modal.type !== 'delete') return
    setDeactivating(true)
    const result = await setAccountActive(modal.account.id, false)
    setDeactivating(false)
    if (result.error) { setDeleteError(result.error); return }
    toast.success('Conta inativada')
    refreshPage()
  }

  async function handleReactivate(account: Account) {
    setReactivatingId(account.id)
    const result = await setAccountActive(account.id, true)
    setReactivatingId(null)
    if (result.error === 'LIMIT_REACHED') {
      setUpgradePrompt({ feature: result.feature!, message: result.message! })
      return
    }
    if (result.error) { toast.error(result.error); return }
    toast.success('Conta reativada')
    router.refresh()
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
        {accounts.length === 0 && inactiveAccounts.length === 0 ? (
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
          <div className="space-y-6">
            {sections.map((section) => {
              const isCollapsed = collapsed.has(section.key)
              return (
                <section key={section.key}>
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    aria-expanded={!isCollapsed}
                    className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-left group"
                  >
                    <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', isCollapsed && '-rotate-90')} />
                    <h2 className="text-sm font-semibold text-gray-700">{section.title}</h2>
                    <span className="text-xs text-gray-400">
                      {section.accounts.length} {section.accounts.length === 1 ? 'conta' : 'contas'}
                    </span>
                    {!section.inTotal && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                        Fora do saldo total
                      </span>
                    )}
                    <span className={cn(
                      'ml-auto text-sm font-semibold tabular-nums',
                      section.subtotal >= 0 ? 'text-gray-700' : 'text-red-600',
                    )}>
                      {formatCurrency(section.subtotal)}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {section.accounts.map((account) => (
                        <AccountCard
                          key={account.id}
                          account={account}
                          onEdit={() => setModal({ type: 'edit', account })}
                          onDelete={() => openDelete(account)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}

        {/* Inactive accounts */}
        {inactiveAccounts.length > 0 && (
          <section>
            <button
              type="button"
              onClick={() => toggleSection('inactive')}
              aria-expanded={!collapsed.has('inactive')}
              className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-left"
            >
              <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', collapsed.has('inactive') && '-rotate-90')} />
              <h2 className="text-sm font-semibold text-gray-500">Contas inativas</h2>
              <span className="text-xs text-gray-400">
                {inactiveAccounts.length} {inactiveAccounts.length === 1 ? 'conta' : 'contas'}
              </span>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                Fora do saldo total
              </span>
            </button>
            {!collapsed.has('inactive') && (
              <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white">
                {inactiveAccounts.map((account) => (
                  <li key={account.id} className="flex items-center gap-3 px-4 py-3">
                    <AccountIcon type={account.type} className="w-4 h-4 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-600 truncate">{account.name}</p>
                      <p className="text-xs text-gray-400">{ACCOUNT_TYPE_LABELS[account.type]}</p>
                    </div>
                    <span className="text-sm tabular-nums text-gray-500">{formatCurrency(account.balance)}</span>
                    <button
                      onClick={() => handleReactivate(account)}
                      disabled={reactivatingId === account.id}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {reactivatingId === account.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCcw className="w-3.5 h-3.5" />}
                      Reativar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
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

      {/* Delete / deactivate modal */}
      {modal.type === 'delete' && (
        <Modal
          title={usage && hasMovement(usage) ? 'Conta com movimentação' : 'Excluir conta'}
          onClose={() => setModal({ type: 'closed' })}
        >
          <div className="space-y-4">
            {usage === undefined ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : usage && hasMovement(usage) ? (
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  <span className="font-semibold text-gray-900">{modal.account.name}</span> tem{' '}
                  <span className="font-semibold text-gray-900">
                    {usage.transactions} {usage.transactions === 1 ? 'transação' : 'transações'}
                  </span>
                  {usage.incomingTransfers > 0 && (
                    <> e <span className="font-semibold text-gray-900">
                      {usage.incomingTransfers} {usage.incomingTransfers === 1 ? 'transferência recebida' : 'transferências recebidas'}
                    </span></>
                  )}
                  , por isso não pode ser excluída.
                </p>
                <p>
                  Ao inativar, ela sai das listas, dos seletores de conta e do saldo total. O histórico continua em
                  Transações e nos relatórios, e você pode reativá-la quando quiser.
                </p>
              </div>
            ) : usage ? (
              <p className="text-sm text-gray-600">
                Tem certeza que deseja excluir a conta{' '}
                <span className="font-semibold text-gray-900">{modal.account.name}</span>?
                Ela não tem nenhuma movimentação. Esta ação não pode ser desfeita.
              </p>
            ) : null}
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
              {usage && hasMovement(usage) ? (
                <button
                  onClick={handleDeactivate}
                  disabled={deactivating}
                  className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {deactivating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                  Inativar conta
                </button>
              ) : usage ? (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {deleting ? 'Excluindo...' : 'Excluir'}
                </button>
              ) : null}
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
