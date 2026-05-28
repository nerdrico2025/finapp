import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Configurações da Empresa' }

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { getEntityMembers } from '@/lib/actions/entities'
import { EmpresaClient } from './EmpresaClient'
import { MembrosClient } from './MembrosClient'
import type { Entity, EntityMemberRole } from '@/types'

export default async function EmpresaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const entityId = await getActiveEntityId(supabase, user.id)
  if (!entityId) redirect('/settings/profile')

  // Allow owner AND admin (not plain members)
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
      .select('*')
      .eq('id', entityId)
      .maybeSingle(),
  ])

  const entity = entityRow as Entity | null
  const role = membership?.role as EntityMemberRole | undefined

  if (!entity || entity.type !== 'business' || !role || role === 'member') {
    redirect('/settings/profile')
  }

  const { data: members } = await getEntityMembers(entityId)

  return (
    <div className="space-y-10">
      {role === 'owner' && <EmpresaClient entity={entity} />}
      <MembrosClient
        entityId={entityId}
        members={members ?? []}
        currentUserId={user.id}
        currentUserRole={role}
      />
    </div>
  )
}
