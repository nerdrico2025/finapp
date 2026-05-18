import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileClient } from './ProfileClient'
import type { Profile } from '@/types'

export const metadata: Metadata = { title: 'Meu Perfil' }

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  console.log('[ProfilePage] user.id:', user?.id, '| authError:', authError)
  if (authError || !user) {
    console.log('[ProfilePage] REDIRECT → /login (auth failed)')
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  console.log('[ProfilePage] profile:', profile, '| profileError:', profileError)

  if (!profile) {
    console.log('[ProfilePage] REDIRECT → /login (no profile)')
    redirect('/login')
  }

  return <ProfileClient profile={profile as Profile} />
}
