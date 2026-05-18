'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { updatePreferences } from '@/lib/actions/settings'

const CURRENCIES = [
  { value: 'BRL', label: 'Real brasileiro (R$)' },
  { value: 'USD', label: 'Dólar americano ($)' },
  { value: 'EUR', label: 'Euro (€)' },
  { value: 'GBP', label: 'Libra esterlina (£)' },
  { value: 'ARS', label: 'Peso argentino ($)' },
]

const schema = z.object({
  currency: z.string().min(1),
})

type Form = z.infer<typeof schema>

export function PreferencesClient({ currency }: { currency: string }) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { currency },
  })

  async function onSubmit(data: Form) {
    const result = await updatePreferences(data)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Preferências salvas!')
      router.refresh()
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
        <SlidersHorizontal className="w-4 h-4 text-gray-400" />
        Preferências gerais
      </h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Moeda padrão
          </label>
          <select
            {...register('currency')}
            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
          >
            {CURRENCIES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar preferências'}
          </button>
        </div>
      </form>
    </div>
  )
}
