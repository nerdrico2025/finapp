'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, CheckCircle2, Eye, EyeOff, Copy, Check } from 'lucide-react'
import { createUser } from '@/lib/actions/admin'

const schema = z.object({
  full_name: z.string().min(2, 'Informe o nome completo'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
})

type FormRaw = z.infer<typeof schema>

interface Props {
  onDone: () => void
}

interface Credentials {
  full_name: string
  email: string
  password: string
}

export function CreateUserForm({ onDone }: Props) {
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState<'email' | 'password' | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormRaw>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', password: '' },
  })

  async function handleFormSubmit(data: FormRaw) {
    setServerError(null)
    const result = await createUser(data)
    if (result.error) {
      setServerError(result.error)
    } else {
      setCredentials(data)
    }
  }

  function copyToClipboard(text: string, field: 'email' | 'password') {
    navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (credentials) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-2 pb-2">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-sm font-semibold text-gray-900">Usuário criado com sucesso!</p>
          <p className="text-xs text-gray-500 text-center">
            Compartilhe as credenciais abaixo com <strong>{credentials.full_name}</strong>.
            A senha não poderá ser recuperada depois que fechar esta janela.
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl divide-y divide-gray-200">
          <CredentialRow
            label="Email"
            value={credentials.email}
            onCopy={() => copyToClipboard(credentials.email, 'email')}
            copied={copied === 'email'}
          />
          <CredentialRow
            label="Senha temporária"
            value={showPassword ? credentials.password : '•'.repeat(credentials.password.length)}
            onCopy={() => copyToClipboard(credentials.password, 'password')}
            copied={copied === 'password'}
            extra={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            }
          />
        </div>

        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          Oriente o usuário a alterar a senha no primeiro acesso.
        </p>

        <button
          onClick={onDone}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Fechar
        </button>
      </div>
    )
  }

  // ── Form state ─────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {serverError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome completo</label>
        <input
          type="text"
          placeholder="João da Silva"
          {...register('full_name')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
        <input
          type="email"
          placeholder="joao@exemplo.com"
          {...register('email')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha temporária</label>
        <input
          type="text"
          placeholder="Mínimo 8 caracteres"
          {...register('password')}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono"
        />
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
        <p className="mt-1 text-xs text-gray-400">
          O usuário deverá alterar a senha no primeiro acesso.
        </p>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar conta'}
        </button>
      </div>
    </form>
  )
}

function CredentialRow({
  label, value, onCopy, copied, extra,
}: {
  label: string
  value: string
  onCopy: () => void
  copied: boolean
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-mono text-gray-900 mt-0.5 truncate">{value}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {extra}
        <button
          type="button"
          onClick={onCopy}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Copiar"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}
