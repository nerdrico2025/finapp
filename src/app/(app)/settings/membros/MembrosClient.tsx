'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Trash2, X, Users, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/cn'
import { inviteMember, removeMember, updateMemberRole } from '@/lib/actions/entities'
import type { MemberWithProfile } from '@/lib/actions/entities'
import type { EntityMemberRole } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<EntityMemberRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  member: 'Membro',
}

const ROLE_BADGE: Record<EntityMemberRole, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-amber-100 text-amber-700',
  member: 'bg-gray-100 text-gray-600',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ profile }: { profile: MemberWithProfile['profile'] }) {
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.full_name ?? ''}
        className="w-9 h-9 rounded-full object-cover shrink-0"
      />
    )
  }
  const initials = (profile?.full_name ?? profile?.email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
      {initials}
    </div>
  )
}

function RoleBadge({ role }: { role: EntityMemberRole }) {
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', ROLE_BADGE[role])}>
      {ROLE_LABELS[role]}
    </span>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  entityId: string
  entityName: string
  members: MemberWithProfile[]
  currentUserId: string
  currentUserRole: EntityMemberRole
}

// ─── Main component ────────────────────────────────────────────────────────────

export function MembrosClient({ entityId, entityName, members, currentUserId, currentUserRole }: Props) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState<MemberWithProfile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)

  const isOwner = currentUserRole === 'owner'

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError(null)
    const result = await inviteMember(entityId, inviteEmail.trim(), inviteRole)
    setInviting(false)
    if (result.error) {
      setInviteError(result.error)
    } else {
      toast.success(`${result.data?.name ?? 'Usuário'} adicionado com sucesso!`)
      setInviteEmail('')
      setInviteRole('member')
      router.refresh()
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const result = await removeMember(entityId, confirmDelete.user_id)
    setDeleting(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Membro removido.')
      setConfirmDelete(null)
      router.refresh()
    }
  }

  async function handleRoleChange(member: MemberWithProfile, newRole: 'admin' | 'member') {
    setUpdatingRole(member.user_id)
    const result = await updateMemberRole(entityId, member.user_id, newRole)
    setUpdatingRole(null)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Função atualizada.')
      router.refresh()
    }
  }

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Membros</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {members.length}
            </span>
          </div>
          <p className="text-sm text-gray-500 ml-7">
            {entityName} · Seu acesso:{' '}
            <span className={cn('font-medium', currentUserRole === 'owner' ? 'text-purple-700' : 'text-amber-700')}>
              {ROLE_LABELS[currentUserRole]}
            </span>
          </p>
        </div>

        {/* Members list */}
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {members.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              Nenhum membro cadastrado.
            </div>
          ) : (
            members.map((member, i) => {
              const isSelf = member.user_id === currentUserId
              const canRemove =
                !isSelf &&
                member.role !== 'owner' &&
                (isOwner || (currentUserRole === 'admin' && member.role === 'member'))
              const canChangeRole = isOwner && !isSelf && member.role !== 'owner'

              return (
                <div
                  key={member.user_id}
                  className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-gray-50')}
                >
                  <Avatar profile={member.profile} />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {member.profile?.full_name || member.profile?.email || 'Usuário'}
                      {isSelf && (
                        <span className="ml-1.5 text-xs text-gray-400 font-normal">(você)</span>
                      )}
                    </p>
                    {member.profile?.full_name && (
                      <p className="text-xs text-gray-400 truncate">{member.profile.email}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {canChangeRole ? (
                      <div className="relative">
                        <select
                          value={member.role}
                          disabled={updatingRole === member.user_id}
                          onChange={(e) => handleRoleChange(member, e.target.value as 'admin' | 'member')}
                          className="appearance-none text-xs font-medium pl-2 pr-6 py-1 rounded-full border border-gray-200 bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                          <option value="admin">Administrador</option>
                          <option value="member">Membro</option>
                        </select>
                        <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}

                    {canRemove ? (
                      <button
                        onClick={() => setConfirmDelete(member)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remover membro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div className="w-7" />
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Invite form */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600" />
            Convidar membro
          </p>

          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              placeholder="email@exemplo.com"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null) }}
              required
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="member">Membro</option>
              <option value="admin">Administrador</option>
            </select>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
            >
              {inviting ? 'Adicionando…' : 'Adicionar'}
            </button>
          </form>

          {inviteError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{inviteError}</p>
          )}

          <p className="text-xs text-gray-400">
            O usuário precisa ter uma conta no Finapp. Acesso concedido imediatamente.
          </p>
        </div>
      </div>

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Remover membro</h3>
              <button
                onClick={() => setConfirmDelete(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Remover{' '}
              <span className="font-semibold text-gray-900">
                {confirmDelete.profile?.full_name || confirmDelete.profile?.email || 'este membro'}
              </span>{' '}
              da empresa? O acesso será revogado imediatamente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {deleting ? 'Removendo…' : 'Remover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
