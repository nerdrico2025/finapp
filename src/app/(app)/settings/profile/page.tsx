import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ProfileClient } from './ProfileClient'
import type { Profile } from '@/types'

export const metadata: Metadata = { title: 'Meu Perfil' }

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  return <ProfileClient profile={profile as Profile} />
}
