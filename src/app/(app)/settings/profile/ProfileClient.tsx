'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, User, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { updateProfile, updatePassword } from '@/lib/actions/settings'
import type { Profile } from '@/types'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Informe o nome completo'),
})

const passwordSchema = z.object({
  new_password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirm_password: z.string(),
}).refine((d) => d.new_password === d.confirm_password, {
  message: 'As senhas não coincidem',
  path: ['confirm_password'],
})

type ProfileForm = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>

export function ProfileClient({ profile }: { profile: Profile }) {
  const router = useRouter()

  // ── Profile form ─────────────────────────────────────────────────────────
  const {
    register: regProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors, isSubmitting: profileSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: profile.full_name ?? '' },
  })

  async function onProfileSubmit(data: ProfileForm) {
    const result = await updateProfile(data)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Perfil atualizado com sucesso!')
      router.refresh()
    }
  }

  // ── Password form ─────────────────────────────────────────────────────────
  const {
    register: regPass,
    handleSubmit: handlePassSubmit,
    reset: resetPass,
    formState: { errors: passErrors, isSubmitting: passSubmitting },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { new_password: '', confirm_password: '' },
  })

  async function onPasswordSubmit(data: PasswordForm) {
    const result = await updatePassword({ new_password: data.new_password })
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Senha alterada com sucesso!')
      resetPass()
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Meu perfil</h1>
        <p className="mt-0.5 text-sm text-gray-500">Gerencie suas informações pessoais</p>
      </div>

      {/* Profile info */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-5 pb-5 border-b border-gray-50">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-lg font-semibold shrink-0">
            {(profile.full_name ?? profile.email).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{profile.full_name ?? '—'}</p>
            <p className="text-xs text-gray-400">{profile.email}</p>
          </div>
        </div>

        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
          <User className="w-4 h-4 text-gray-400" />
          Informações pessoais
        </h2>

        <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome completo</label>
            <input
              type="text"
              {...regProfile('full_name')}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            {profileErrors.full_name && (
              <p className="mt-1 text-xs text-red-600">{profileErrors.full_name.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-400">O email não pode ser alterado.</p>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profileSubmitting}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {profileSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>

      {/* Password */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
          <Lock className="w-4 h-4 text-gray-400" />
          Alterar senha
        </h2>

        <form onSubmit={handlePassSubmit(onPasswordSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nova senha</label>
            <input
              type="password"
              placeholder="Mínimo 8 caracteres"
              {...regPass('new_password')}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            {passErrors.new_password && (
              <p className="mt-1 text-xs text-red-600">{passErrors.new_password.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar nova senha</label>
            <input
              type="password"
              placeholder="Repita a nova senha"
              {...regPass('confirm_password')}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            {passErrors.confirm_password && (
              <p className="mt-1 text-xs text-red-600">{passErrors.confirm_password.message}</p>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={passSubmitting}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {passSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Alterar senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
