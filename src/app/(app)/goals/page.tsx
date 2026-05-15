import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Metas' }

import { getGoals } from '@/lib/actions/goals'
import { GoalsClient } from './GoalsClient'

export default async function GoalsPage() {
  const { data: goals } = await getGoals()

  return <GoalsClient goals={goals ?? []} />
}
