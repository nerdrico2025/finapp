import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SubscriptionClient } from './SubscriptionClient'
import type { Profile } from '@/types'

export const metadata: Metadata = { title: 'Minha Assinatura' }

interface Props {
  searchParams: Promise<{ success?: string }>
}

export default async function SubscriptionPage({ searchParams }: Props) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const { success } = await searchParams

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Minha Assinatura</h1>
      <SubscriptionClient
        profile={profile as Profile}
        showSuccess={success === 'true'}
      />
    </div>
  )
}
