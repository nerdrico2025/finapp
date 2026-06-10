'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { seedDefaultCategories } from '@/lib/actions/categories'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: getAuthErrorMessage(error.message) }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function register(formData: FormData) {
  const supabase = await createClient()

  const fullName = formData.get('full_name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  })

  if (error) {
    return { error: getAuthErrorMessage(error.message) }
  }

  if (data.user) {
    await seedDefaultCategories(data.user.id)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()

  const fullName = formData.get('full_name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })

  if (error) {
    return { error: getAuthErrorMessage(error.message) }
  }

  const requiresConfirmation =
    !data.session || (data.user?.identities?.length === 0)

  return { success: true, requiresConfirmation }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

function getAuthErrorMessage(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'Email ou senha incorretos.'
  }
  if (message.includes('Email not confirmed')) {
    return 'Confirme seu email antes de entrar.'
  }
  if (message.includes('User already registered')) {
    return 'Este email já está cadastrado.'
  }
  if (message.includes('Password should be at least')) {
    return 'A senha deve ter pelo menos 6 caracteres.'
  }
  if (message.includes('Unable to validate email address')) {
    return 'Endereço de email inválido.'
  }
  if (message.includes('Email rate limit exceeded')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  }
  return 'Ocorreu um erro. Tente novamente.'
}
