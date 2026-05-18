'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateUserData {
  full_name: string
  email: string
  password: string
}

// ─── Guard ────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { adminId: null, error: 'Não autenticado' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { adminId: null, error: 'Sem permissão de administrador' }
  }

  return { adminId: user.id, error: null }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function getUsers() {
  const { adminId, error: guardError } = await requireAdmin()
  if (guardError || !adminId) return { data: null, error: guardError }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .eq('created_by', adminId)
    .order('created_at', { ascending: false })

  return {
    data: (data ?? []) as Profile[],
    error: error?.message ?? null,
  }
}

export async function createUser(formData: CreateUserData) {
  const { adminId, error: guardError } = await requireAdmin()
  if (guardError || !adminId) return { error: guardError }

  const admin = createAdminClient()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: formData.email,
    password: formData.password,
    user_metadata: { full_name: formData.full_name, role: 'user' },
    email_confirm: true,
  })

  if (createError || !created.user) {
    return { error: createError?.message ?? 'Erro ao criar usuário' }
  }

  // Upsert profile with created_by (trigger may have already run)
  await admin.from('profiles').upsert({
    id: created.user.id,
    email: formData.email,
    full_name: formData.full_name,
    role: 'user',
    created_by: adminId,
  })

  revalidatePath('/settings/users')
  return { error: null }
}

export async function deleteUser(id: string) {
  const { adminId, error: guardError } = await requireAdmin()
  if (guardError || !adminId) return { error: guardError }

  if (id === adminId) {
    return { error: 'Você não pode excluir sua própria conta' }
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(id)

  if (error) return { error: error.message }

  revalidatePath('/settings/users')
  return { error: null }
}
