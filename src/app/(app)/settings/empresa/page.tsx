import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Configurações da Empresa' }

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { EmpresaClient } from './EmpresaClient'
import type { Entity } from '@/types'

export default async function EmpresaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const entityId = await getActiveEntityId(supabase, user.id)
  if (!entityId) redirect('/settings/profile')

  const { data: entity } = await supabase
    .from('entities')
    .select('*')
    .eq('id', entityId)
    .eq('owner_id', user.id)
    .single()

  if (!entity || entity.type !== 'business') redirect('/settings/profile')

  return <EmpresaClient entity={entity as Entity} />
}
