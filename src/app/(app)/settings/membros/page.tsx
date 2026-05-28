import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Membros da Empresa' }

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { getEntityMembers } from '@/lib/actions/entities'
import { MembrosClient } from './MembrosClient'
import type { EntityMemberRole } from '@/types'

export default async function MembrosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const entityId = await getActiveEntityId(supabase, user.id)
  if (!entityId) redirect('/settings/profile')

  const [{ data: membership }, { data: entityRow }] = await Promise.all([
    supabase
      .from('entity_members')
      .select('role')
      .eq('entity_id', entityId)
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .maybeSingle(),
    supabase
      .from('entities')
      .select('id, type, name')
      .eq('id', entityId)
      .maybeSingle(),
  ])

  const role = membership?.role as EntityMemberRole | undefined

  if (!entityRow || entityRow.type !== 'business' || !role || role === 'member') {
    redirect('/settings/profile')
  }

  const { data: members } = await getEntityMembers(entityId)

  return (
    <MembrosClient
      entityId={entityId}
      entityName={entityRow.name}
      members={members ?? []}
      currentUserId={user.id}
      currentUserRole={role}
    />
  )
}
