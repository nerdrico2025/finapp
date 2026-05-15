import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsers } from '@/lib/actions/admin'
import { UsersClient } from './UsersClient'

export default async function UsersPage() {
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
