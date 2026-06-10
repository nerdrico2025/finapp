'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { signUp } from '@/lib/actions/auth'
import { Loader2, TrendingUp, MailCheck } from 'lucide-react'

const signUpSchema = z
  .object({
    full_name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    email: z.string().email('E-mail inválido'),
    password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'As senhas não coincidem',
    path: ['confirm_password'],
  })

type SignUpFormData = z.infer<typeof signUpSchema>

function SignUpPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const plan = searchParams.get('plan')
  const [serverError, setServerError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  })

  async function onSubmit(data: SignUpFormData) {
    setServerError(null)
    const formData = new FormData()
    formData.append('full_name', data.full_name)
    formData.append('email', data.email)
    formData.append('password', data.password)

    const result = await signUp(formData)

    if ('error' in result && result.error) {
      setServerError(result.error)
      return
    }

    if (result.requiresConfirmation) {
      setEmailSent(true)
    } else if (plan === 'pro_pf') {
      router.push(`/api/checkout?price=${process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_PF}`)
    } else if (plan === 'pro_pj') {
      router.push(`/api/checkout?price=${process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_PJ}`)
    } else {
      router.push('/dashboard')
    }
  }

  if (emailSent) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-gray-900">FinApp</span>
            </div>
          </div>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-sm border border-gray-100 rounded-2xl sm:px-10 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center">
                <MailCheck className="w-7 h-7 text-emerald-600" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Verifique seu e-mail
            </h2>
            <p className="text-sm text-gray-500">
              Enviamos um link de confirmação para o seu e-mail. Clique nele para ativar sua conta.
            </p>
            <p className="mt-6 text-sm text-gray-500">
              Já confirmou?{' '}
              <Link
                href="/login"
                className="font-medium text-emerald-600 hover:text-emerald-500 transition-colors"
              >
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">FinApp</span>
          </div>
        </div>
        <h2 className="mt-6 text-center text-2xl font-semibold text-gray-900">
          Crie sua conta grátis
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          Já tem uma conta?{' '}
          <Link
            href="/login"
            className="font-medium text-emerald-600 hover:text-emerald-500 transition-colors"
          >
            Entrar
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-gray-100 rounded-2xl sm:px-10">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {serverError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-700">{serverError}</p>
              </div>
            )}

            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1.5">
                Nome completo
              </label>
              <input
                id="full_name"
                type="text"
                autoComplete="name"
                placeholder="Seu nome"
                {...register('full_name')}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow"
              />
              {errors.full_name && (
                <p className="mt-1.5 text-xs text-red-600">{errors.full_name.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                {...register('email')}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow"
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                {...register('password')}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow"
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirmar senha
              </label>
              <input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                {...register('confirm_password')}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow"
              />
              {errors.confirm_password && (
                <p className="mt-1.5 text-xs text-red-600">{errors.confirm_password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium text-sm rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Criar conta'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpPageContent />
    </Suspense>
  )
}
