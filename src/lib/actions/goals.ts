'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import type { Goal } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoalFormData {
  name: string
  description?: string | null
  target_amount: number
  current_amount?: number
  target_date?: string | null
  icon?: string | null
  color?: string | null
}

export type GoalWithProgress = Goal & {
  percentage: number
  days_remaining: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeProgress(goal: Goal): GoalWithProgress {
  const percentage =
    goal.target_amount > 0
      ? Math.min((goal.current_amount / goal.target_amount) * 100, 100)
      : 0

  let days_remaining: number | null = null
  if (goal.target_date) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(goal.target_date + 'T00:00:00')
    days_remaining = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  return { ...goal, percentage, days_remaining }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function getGoals() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  let query = supabase
    .from('goals')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (entityId) query = query.eq('entity_id', entityId)

  const { data, error } = await query

  if (error) return { data: null, error: error.message }

  return {
    data: (data ?? []).map(computeProgress),
    error: null,
  }
}

export async function createGoal(formData: GoalFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  const { error } = await supabase.from('goals').insert({
    user_id: user.id,
    entity_id: entityId,
    name: formData.name,
    description: formData.description ?? null,
    target_amount: formData.target_amount,
    current_amount: formData.current_amount ?? 0,
    target_date: formData.target_date ?? null,
    icon: formData.icon ?? null,
    color: formData.color ?? null,
    status: 'active',
  })

  if (error) return { error: error.message }
  revalidatePath('/goals')
  return { error: null }
}

export async function updateGoal(id: string, formData: Partial<GoalFormData>) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('goals')
    .update({
      ...(formData.name           !== undefined && { name: formData.name }),
      ...(formData.description    !== undefined && { description: formData.description }),
      ...(formData.target_amount  !== undefined && { target_amount: formData.target_amount }),
      ...(formData.current_amount !== undefined && { current_amount: formData.current_amount }),
      ...(formData.target_date    !== undefined && { target_date: formData.target_date }),
      ...(formData.icon           !== undefined && { icon: formData.icon }),
      ...(formData.color          !== undefined && { color: formData.color }),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/goals')
  return { error: null }
}

export async function contributeToGoal(id: string, amount: number) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: goal } = await supabase
    .from('goals')
    .select('current_amount, target_amount')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!goal) return { error: 'Meta não encontrada' }

  const newAmount = goal.current_amount + amount
  const isComplete = newAmount >= goal.target_amount

  const { error } = await supabase
    .from('goals')
    .update({
      current_amount: newAmount,
      ...(isComplete && { status: 'completed' as const }),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/goals')
  return { error: null, completed: isComplete }
}

export async function completeGoal(id: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('goals')
    .update({ status: 'completed' })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/goals')
  return { error: null }
}

export async function deleteGoal(id: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/goals')
  return { error: null }
}
