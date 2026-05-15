'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, X, UserCircle2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { deleteUser } from '@/lib/actions/admin'
import { CreateUserForm } from '@/components/forms/CreateUserForm'
import { formatDate } from '@/lib/utils/format'
import type { Profile } from '@/types'

type Modal =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'delete'; user: Profile }

interface Props {
  users: Profile[]
}

export function UsersClient({ users }: Props) {
  const [modal, setModal] = useState<Modal>({ type: 'closed' })
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  function refresh() {
    router.refresh()
    setModal({ type: 'closed' })
  }

  async function handleDelete() {
    if (modal.type !== 'delete') return
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteUser(modal.user.id)
    setDeleting(false)
    if (result.error) {
      setDeleteError(result.error)
    } else {
      toast.success('Usuário excluído!')
      refresh()
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Usuários</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Contas criadas por você ({users.length})
            </p>
          </div>
          <button
            onClick={() => setModal({ type: 'create' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar conta
          </button>
        </div>

        {/* Users list */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
            <Users className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-gray-900">Lista de usuários</h2>
          </div>

          {users.length === 0 ? (
            <div className="py-14 text-center">
              <UserCircle2 className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-500">Nenhum usuário criado ainda.</p>
              <button
                onClick={() => setModal({ type: 'create' })}
                className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Criar primeira conta
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {users.map((user) => (
                <li key={user.id} className="group flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-emerald-700">
                      {(user.full_name ?? user.email).charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user.full_name ?? '—'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>

                  {/* Date */}
                  <p className="text-xs text-gray-400 shrink-0 hidden sm:block">
                    Criado em {formatDate(user.created_at)}
                  </p>

                  {/* Delete */}
                  <button
                    onClick={() => { setDeleteError(null); setModal({ type: 'delete', user }) }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="Excluir usuário"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Create modal */}
      {modal.type === 'create' && (
        <ModalShell title="Criar nova conta" onClose={() => setModal({ type: 'closed' })}>
          <CreateUserForm onDone={() => { toast.success('Usuário criado!'); setModal({ type: 'closed' }); router.refresh() }} />
        </ModalShell>
      )}

      {/* Delete modal */}
      {modal.type === 'delete' && (
        <ModalShell title="Excluir usuário" onClose={() => setModal({ type: 'closed' })}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Excluir a conta de{' '}
              <span className="font-semibold text-gray-900">
                {modal.user.full_name ?? modal.user.email}
              </span>
              ? Todos os dados do usuário serão removidos permanentemente.
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
