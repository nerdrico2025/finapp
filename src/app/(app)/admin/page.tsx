import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsers } from '@/lib/actions/admin'
import { UsersClient } from '@/app/(app)/settings/users/UsersClient'

export const metadata: Metadata = { title: 'Admin — Usuários' }

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: users } = await getUsers()

  return <UsersClient users={users ?? []} />
}
