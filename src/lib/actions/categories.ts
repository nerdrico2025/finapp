'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { CategoryType } from '@/types'

export interface CategoryFormData {
  name: string
  type: CategoryType
  icon: string
  color: string
  parent_id?: string | null
}

export async function getCategories(type?: CategoryType) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { data: null, error: 'Não autenticado' }

  let query = supabase
    .from('categories')
    .select('*')
    .or(`user_id.eq.${user.id},is_default.eq.true`)
    .order('name')

  if (type) {
    query = query.eq('type', type)
  }

  const { data, error } = await query

  return { data, error: error?.message ?? null }
}

export async function createCategory(formData: CategoryFormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase.from('categories').insert({
    user_id: user.id,
    name: formData.name,
    type: formData.type,
    icon: formData.icon || null,
    color: formData.color || null,
    parent_id: formData.parent_id ?? null,
    is_default: false,
  })

  if (error) return { error: error.message }

  revalidatePath('/categories')
  return { error: null }
}

export async function updateCategory(id: string, formData: Partial<CategoryFormData>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('categories')
    .update({
      name: formData.name,
      icon: formData.icon ?? null,
      color: formData.color ?? null,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/categories')
  return { error: null }
}

export async function deleteCategory(id: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Não autenticado' }

  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', id)

  if (count && count > 0) {
    return { error: 'Não é possível excluir uma categoria com transações vinculadas.' }
  }

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/categories')
  return { error: null }
}

export async function seedDefaultCategories(userId: string) {
  const supabase = await createClient()

  const expenses = [
    { name: 'Alimentação', icon: '🍽️', color: '#ef4444' },
    { name: 'Transporte', icon: '🚗', color: '#f97316' },
    { name: 'Moradia', icon: '🏠', color: '#8b5cf6' },
    { name: 'Saúde', icon: '💊', color: '#ec4899' },
    { name: 'Lazer', icon: '🎮', color: '#3b82f6' },
    { name: 'Educação', icon: '📚', color: '#14b8a6' },
    { name: 'Vestuário', icon: '👕', color: '#f59e0b' },
    { name: 'Outros', icon: '📦', color: '#64748b' },
  ]

  const incomes = [
    { name: 'Salário', icon: '💼', color: '#10b981' },
    { name: 'Freelance', icon: '💻', color: '#06b6d4' },
    { name: 'Investimentos', icon: '📈', color: '#84cc16' },
    { name: 'Outros', icon: '💰', color: '#6366f1' },
  ]

  const rows = [
    ...expenses.map((c) => ({ ...c, type: 'expense' as CategoryType, user_id: userId, is_default: false, parent_id: null })),
    ...incomes.map((c) => ({ ...c, type: 'income' as CategoryType, user_id: userId, is_default: false, parent_id: null })),
  ]

  await supabase.from('categories').insert(rows)
}
