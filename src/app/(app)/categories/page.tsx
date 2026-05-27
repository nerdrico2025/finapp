import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Categorias' }

import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { getCategories } from '@/lib/actions/categories'
import { CategoriesClient } from './CategoriesClient'

export default async function CategoriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isBusinessEntity = false
  if (user) {
    const entityId = await getActiveEntityId(supabase, user.id)
    if (entityId) {
      const { data: entity } = await supabase
        .from('entities')
        .select('type')
        .eq('id', entityId)
        .single()
      isBusinessEntity = entity?.type === 'business'
    }
  }

  const [{ data: expenses }, { data: incomes }] = await Promise.all([
    getCategories('expense'),
    getCategories('income'),
  ])

  return (
    <CategoriesClient
      expenses={expenses ?? []}
      incomes={incomes ?? []}
      isBusinessEntity={isBusinessEntity}
    />
  )
}
