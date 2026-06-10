import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Lista de Sonhos' }

import { createClient } from '@/lib/supabase/server'
import { DreamListClient } from './DreamListClient'
import { UpgradeGate } from '@/components/ui/UpgradeGate'

export default async function DreamListPage() {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lists } = await (supabase as any)
    .from('dream_lists')
    .select('*, dream_items(*)')
    .order('created_at', { ascending: false })

  return (
    <UpgradeGate feature="canAccessDreamList">
      <DreamListClient initialLists={lists ?? []} />
    </UpgradeGate>
  )
}
