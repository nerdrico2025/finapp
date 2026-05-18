'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, User } from 'lucide-react'
import { toast } from 'sonner'
import { updateProfile } from '@/lib/actions/settings'
import type { Profile } from '@/types'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Informe o nome completo'),
})

type ProfileForm = z.infer<typeof profileSchema>

export function ProfileClient({ profile }: { profile: Profile }) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: profile.full_name ?? '' },
  })

  async function onSubmit(data: ProfileForm) {
    const result = await updateProfile(data)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Perfil atualizado com sucesso!')
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-5 pb-5 border-b border-gray-50">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-lg font-semibold shrink-0">
            {(profile.full_name ?? profile.email ?? '?').charAt(0).toUpperCase()}
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nome completo
            </label>
            <input
              type="text"
              {...register('full_name')}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            {errors.full_name && (
              <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>
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
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
