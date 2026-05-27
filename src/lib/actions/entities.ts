'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Entity } from '@/types'

// ─── CNPJ validation ──────────────────────────────────────────────────────────

function validateCNPJ(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false
  const calc = (len: number) => {
    let sum = 0, weight = len - 7
    for (let i = 0; i < len; i++) {
      sum += parseInt(digits[i]) * weight--
      if (weight < 2) weight = 9
    }
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === parseInt(digits[12]) && calc(13) === parseInt(digits[13])
}

const TAX_REGIMES = ['simples_nacional', 'lucro_presumido', 'lucro_real', 'mei'] as const

const createSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  cnpj: z.string().optional(),
})

const updateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  cnpj: z.string().optional().nullable().refine((val: string | null | undefined) => {
    if (!val) return true
    const d = val.replace(/\D/g, '')
    return d.length === 0 || validateCNPJ(d)
  }, 'CNPJ inválido — verifique os dígitos'),
  tax_regime: z.enum(TAX_REGIMES).optional().nullable(),
  activity: z.string().max(200).optional().nullable(),
  logo_url: z.string().optional().nullable(),
})

export async function createBusinessEntity(input: { name: string; cnpj?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado', data: null }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, data: null }
  }

  const { name, cnpj } = parsed.data

  const { data: entity, error } = await supabase
    .from('entities')
    .insert({ owner_id: user.id, name, type: 'business', cnpj: cnpj || null })
    .select()
    .single()

  if (error) return { error: error.message, data: null }

  await seedBusinessCategories(entity.id, user.id)

  revalidatePath('/', 'layout')
  return { error: null, data: entity as Entity }
}

export async function updateBusinessEntity(
  entityId: string,
  input: {
    name: string
    cnpj?: string | null
    tax_regime?: string | null
    activity?: string | null
    logo_url?: string | null
  }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado', data: null }

  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, data: null }
  }

  const { name, cnpj, tax_regime, activity, logo_url } = parsed.data

  // Verify ownership
  const { data: existing } = await supabase
    .from('entities')
    .select('id')
    .eq('id', entityId)
    .eq('owner_id', user.id)
    .single()

  if (!existing) return { error: 'Entidade não encontrada', data: null }

  const { data: updated, error } = await supabase
    .from('entities')
    .update({
      name,
      cnpj: cnpj ? cnpj.replace(/\D/g, '') || null : null,
      tax_regime: tax_regime ?? null,
      activity: activity || null,
      logo_url: logo_url ?? null,
    })
    .eq('id', entityId)
    .select()
    .single()

  if (error) return { error: error.message, data: null }

  revalidatePath('/', 'layout')
  return { error: null, data: updated as Entity }
}

async function seedBusinessCategories(entityId: string, userId: string) {
  const supabase = await createClient()

  const incomes = [
    { name: 'Receita de Serviços', icon: '🛠️', color: '#10b981' },
    { name: 'Receita de Produtos', icon: '📦', color: '#06b6d4' },
    { name: 'Outras Receitas', icon: '💰', color: '#84cc16' },
  ]

  const expenses = [
    { name: 'Pessoal', icon: '👥', color: '#6366f1' },
    { name: 'Aluguel', icon: '🏢', color: '#8b5cf6' },
    { name: 'Marketing', icon: '📣', color: '#ec4899' },
    { name: 'Tecnologia', icon: '💻', color: '#3b82f6' },
    { name: 'Contabilidade', icon: '📊', color: '#14b8a6' },
    { name: 'Impostos', icon: '🧾', color: '#f59e0b' },
    { name: 'Fornecedores', icon: '🏭', color: '#f97316' },
    { name: 'Despesas Administrativas', icon: '📋', color: '#64748b' },
    { name: 'Outras Despesas', icon: '📦', color: '#9ca3af' },
  ]

  const rows = [
    ...incomes.map(c => ({ ...c, type: 'income' as const, user_id: userId, entity_id: entityId, is_default: false, parent_id: null })),
    ...expenses.map(c => ({ ...c, type: 'expense' as const, user_id: userId, entity_id: entityId, is_default: false, parent_id: null })),
  ]

  await supabase.from('categories').insert(rows)
}
