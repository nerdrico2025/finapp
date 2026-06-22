'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import type { Category, CategoryType } from '@/types'

export interface CategoryFormData {
  name: string
  type: CategoryType
  icon: string
  color: string
  parent_id?: string | null
  is_default?: boolean
  dre_group?: string | null
}

export async function getCategories(type?: CategoryType) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { data: null, error: 'Não autenticado' }

  const entityId = await getActiveEntityId(supabase, user.id)

  // PF: only categories with entity_id IS NULL; PJ: only categories for that entity; plus global defaults
  const orFilter = entityId
    ? `and(user_id.eq.${user.id},entity_id.eq.${entityId}),is_default.eq.true`
    : `and(user_id.eq.${user.id},entity_id.is.null),is_default.eq.true`

  let query = supabase
    .from('categories')
    .select('*')
    .or(orFilter)
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

  if (!user) return { error: 'Não autenticado', data: null }

  const entityId = await getActiveEntityId(supabase, user.id)

  const { data: created, error } = await supabase.from('categories').insert({
    user_id: user.id,
    entity_id: entityId,
    name: formData.name,
    type: formData.type,
    icon: formData.icon || null,
    color: formData.color || null,
    parent_id: formData.parent_id ?? null,
    is_default: formData.is_default ?? false,
    dre_group: formData.dre_group ?? null,
  }).select().single()

  if (error) return { error: error.message, data: null }

  revalidatePath('/categories')
  return { error: null, data: created as Category }
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
      dre_group: formData.dre_group ?? null,
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

export async function ensureDefaultCategoriesForImport(): Promise<Category[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const entityId = await getActiveEntityId(supabase, user.id)

  const existingFilter = entityId
    ? `and(user_id.eq.${user.id},entity_id.eq.${entityId}),is_default.eq.true`
    : `and(user_id.eq.${user.id},entity_id.is.null),is_default.eq.true`

  const { data: existing } = await supabase
    .from('categories')
    .select('*')
    .or(existingFilter)
    .order('name')

  if (existing && existing.length > 0) return existing as Category[]

  const defaults = [
    { name: 'Alimentação', icon: '🍽️', color: '#22c55e', type: 'expense' as CategoryType },
    { name: 'Assinaturas', icon: '📱', color: '#06b6d4', type: 'expense' as CategoryType },
    { name: 'Lazer', icon: '🎬', color: '#8b5cf6', type: 'expense' as CategoryType },
    { name: 'Moradia', icon: '🏠', color: '#f59e0b', type: 'expense' as CategoryType },
    { name: 'Outros', icon: '📦', color: '#9ca3af', type: 'expense' as CategoryType },
    { name: 'Saúde', icon: '💊', color: '#ef4444', type: 'expense' as CategoryType },
    { name: 'Transferência', icon: '↔️', color: '#6b7280', type: 'expense' as CategoryType },
    { name: 'Transporte', icon: '🚗', color: '#3b82f6', type: 'expense' as CategoryType },
    { name: 'Receitas', icon: '💰', color: '#10b981', type: 'income' as CategoryType },
  ]

  const { data: created } = await supabase
    .from('categories')
    .insert(defaults.map(c => ({ ...c, user_id: user.id, entity_id: entityId, is_default: false, parent_id: null })))
    .select()

  return (created ?? []) as Category[]
}

export async function seedDefaultCategories(userId: string) {
  const supabase = await createClient()

  const entityId = await getActiveEntityId(supabase, userId)

  // Idempotency guard — skip if categories already exist for this entity
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('entity_id', entityId ?? '')
    .limit(1)

  if (existing && existing.length > 0) return

  const base = { user_id: userId, entity_id: entityId, is_default: false }

  // ── Expense parents ──────────────────────────────────────────────────────────
  const expenseParents = [
    { name: 'Moradia',                icon: '🏠', color: '#8b5cf6' },
    { name: 'Alimentação',            icon: '🍽️', color: '#ef4444' },
    { name: 'Saúde',                  icon: '💊', color: '#ec4899' },
    { name: 'Educação',               icon: '📚', color: '#14b8a6' },
    { name: 'Transporte',             icon: '🚗', color: '#3b82f6' },
    { name: 'Lazer e Entretenimento', icon: '🎬', color: '#8b5cf6' },
    { name: 'Finanças e Dívidas',     icon: '💳', color: '#6366f1' },
    { name: 'Vestuário',              icon: '👕', color: '#f59e0b' },
    { name: 'Cuidados Pessoais',      icon: '💅', color: '#f472b6' },
    { name: 'Pets',                   icon: '🐾', color: '#f97316' },
    { name: 'Impostos e Taxas',       icon: '🏛️', color: '#64748b' },
    { name: 'Outros',                 icon: '📦', color: '#9ca3af' },
  ] as const

  const { data: insertedParents } = await supabase
    .from('categories')
    .insert(expenseParents.map(c => ({ ...base, ...c, type: 'expense' as CategoryType, parent_id: null })))
    .select('id, name')

  const parentId = (name: string) =>
    insertedParents?.find(p => p.name === name)?.id ?? null

  // ── Expense subcategories ────────────────────────────────────────────────────
  type Sub = { name: string; icon: string; color: string }
  const expenseSubs: { parent: string; color: string; subs: Omit<Sub, 'color'>[] }[] = [
    {
      parent: 'Moradia', color: '#8b5cf6',
      subs: [
        { name: 'Aluguel',              icon: '🏠' },
        { name: 'Condomínio',           icon: '🏢' },
        { name: 'Energia elétrica',     icon: '⚡' },
        { name: 'Água e esgoto',        icon: '💧' },
        { name: 'Telefonia e internet', icon: '📡' },
        { name: 'Manutenção da casa',   icon: '🔧' },
      ],
    },
    {
      parent: 'Transporte', color: '#3b82f6',
      subs: [
        { name: 'Aplicativos de transporte', icon: '🚕' },
        { name: 'Combustível',              icon: '⛽' },
        { name: 'Estacionamento e pedágio', icon: '🅿️' },
        { name: 'Manutenção do veículo',    icon: '🔧' },
        { name: 'IPVA e seguro auto',       icon: '📋' },
      ],
    },
    {
      parent: 'Alimentação', color: '#ef4444',
      subs: [
        { name: 'Supermercado',                icon: '🛒' },
        { name: 'Restaurantes e lanchonetes',  icon: '🍴' },
        { name: 'Delivery',                    icon: '🛵' },
        { name: 'Padaria e café',              icon: '☕' },
      ],
    },
    {
      parent: 'Saúde', color: '#ec4899',
      subs: [
        { name: 'Plano de saúde',       icon: '🏥' },
        { name: 'Consultas médicas',    icon: '👨‍⚕️' },
        { name: 'Medicamentos',         icon: '💊' },
        { name: 'Exames laboratoriais', icon: '🔬' },
        { name: 'Academia e bem-estar', icon: '🏋️' },
      ],
    },
    {
      parent: 'Educação', color: '#14b8a6',
      subs: [
        { name: 'Escola e faculdade',        icon: '🎓' },
        { name: 'Cursos e treinamentos',     icon: '📖' },
        { name: 'Livros e material escolar', icon: '📚' },
      ],
    },
    {
      parent: 'Lazer e Entretenimento', color: '#3b82f6',
      subs: [
        { name: 'Streaming (Netflix, Spotify…)', icon: '📺' },
        { name: 'Viagens e hospedagem',          icon: '✈️' },
        { name: 'Cinema, teatro e shows',        icon: '🎭' },
        { name: 'Hobbies e esportes',            icon: '⚽' },
      ],
    },
    {
      parent: 'Finanças e Dívidas', color: '#6366f1',
      subs: [
        { name: 'Financiamento imobiliário',  icon: '🏗️' },
        { name: 'Financiamento de veículo',   icon: '🚘' },
        { name: 'Empréstimo pessoal',         icon: '🏦' },
        { name: 'Consórcio',                  icon: '📑' },
        { name: 'Cartão de crédito (fatura)', icon: '💳' },
        { name: 'Tarifas bancárias',          icon: '🏛️' },
      ],
    },
    {
      parent: 'Vestuário', color: '#f59e0b',
      subs: [
        { name: 'Roupas',                icon: '👗' },
        { name: 'Calçados e acessórios', icon: '👟' },
      ],
    },
    {
      parent: 'Pets', color: '#f97316',
      subs: [
        { name: 'Ração e petiscos', icon: '🦴' },
        { name: 'Veterinário',      icon: '🐶' },
        { name: 'Pet shop e banho', icon: '🛁' },
      ],
    },
    {
      parent: 'Impostos e Taxas', color: '#64748b',
      subs: [
        { name: 'IPTU',             icon: '🏘️' },
        { name: 'Imposto de Renda', icon: '📄' },
        { name: 'IOF',              icon: '💸' },
        { name: 'Outras taxas',     icon: '📋' },
      ],
    },
    {
      parent: 'Cuidados Pessoais', color: '#f472b6',
      subs: [
        { name: 'Salão e estética',       icon: '💇' },
        { name: 'Farmácia e higiene',     icon: '🧴' },
        { name: 'Academia e saúde',       icon: '🏋️' },
        { name: 'Vestuário e acessórios', icon: '👗' },
      ],
    },
  ]

  const subRows = expenseSubs.flatMap(({ parent, color, subs }) => {
    const pid = parentId(parent)
    if (!pid) return []
    return subs.map(s => ({ ...base, ...s, color, type: 'expense' as CategoryType, parent_id: pid }))
  })

  // ── Income parent ────────────────────────────────────────────────────────────
  const { data: incomeParents } = await supabase
    .from('categories')
    .insert([{ ...base, name: 'Receitas', type: 'income' as CategoryType, icon: '💰', color: '#10b981', parent_id: null }])
    .select('id')

  const receitasId = incomeParents?.[0]?.id ?? null

  // ── Income subcategories ─────────────────────────────────────────────────────
  const incomeSubs = receitasId ? [
    { name: 'Salário',                      icon: '💼' },
    { name: 'Freelance e renda extra',      icon: '💻' },
    { name: 'Aluguel recebido',             icon: '🏠' },
    { name: 'Rendimentos de investimentos', icon: '📈' },
    { name: 'Reembolsos',                   icon: '↩️' },
    { name: 'Outros recebimentos',          icon: '💰' },
    { name: 'Outros rendimentos',           icon: '💵' },
  ].map(s => ({ ...base, ...s, color: '#10b981', type: 'income' as CategoryType, parent_id: receitasId })) : []

  if (subRows.length > 0 || incomeSubs.length > 0) {
    await supabase.from('categories').insert([...subRows, ...incomeSubs])
  }
}
