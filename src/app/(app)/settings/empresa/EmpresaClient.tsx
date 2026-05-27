'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Building2, Upload, X, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { updateBusinessEntity } from '@/lib/actions/entities'
import { useEntityContext } from '@/contexts/EntityContext'
import { cn } from '@/lib/utils/cn'
import type { Entity } from '@/types'

// ─── CNPJ helpers ─────────────────────────────────────────────────────────────

function maskCNPJ(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

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

// ─── Form schema ──────────────────────────────────────────────────────────────

const TAX_REGIMES = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido',  label: 'Lucro Presumido' },
  { value: 'lucro_real',       label: 'Lucro Real' },
  { value: 'mei',              label: 'MEI' },
] as const

const schema = z.object({
  name:        z.string().min(1, 'Nome é obrigatório').max(100),
  cnpj:        z.string().optional().refine((val: string | undefined) => {
    if (!val) return true
    const d = val.replace(/\D/g, '')
    return d.length === 0 || validateCNPJ(d)
  }, 'CNPJ inválido — verifique os dígitos verificadores'),
  tax_regime:  z.string().optional().nullable(),
  activity:    z.string().max(200, 'Máximo 200 caracteres').optional(),
})

type FormValues = z.infer<typeof schema>

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { entity: Entity }

export function EmpresaClient({ entity }: Props) {
  const router = useRouter()
  const { updateEntity } = useEntityContext()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(entity.logo_url ?? null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [removeLogoFlag, setRemoveLogoFlag] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:       entity.name,
      cnpj:       entity.cnpj ? maskCNPJ(entity.cnpj) : '',
      tax_regime: entity.tax_regime ?? '',
      activity:   entity.activity ?? '',
    },
  })

  // ── Logo handling ───────────────────────────────────────────────────────────

  function handleFileSelect(e: { target: HTMLInputElement }) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo 2 MB.')
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setRemoveLogoFlag(false)
  }

  function handleRemoveLogo() {
    setLogoFile(null)
    setLogoPreview(null)
    setRemoveLogoFlag(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadLogo(entityId: string, file: File): Promise<string | null> {
    const supabase = createClient()
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${entityId}/${Date.now()}.${ext}`

    setIsUploadingLogo(true)
    const { error: uploadError } = await supabase.storage
      .from('entity-logos')
      .upload(path, file, { upsert: true, contentType: file.type })
    setIsUploadingLogo(false)

    if (uploadError) {
      toast.error('Erro ao enviar imagem: ' + uploadError.message)
      return null
    }

    const { data: { publicUrl } } = supabase.storage
      .from('entity-logos')
      .getPublicUrl(path)

    return publicUrl
  }

  // ── Form submit ─────────────────────────────────────────────────────────────

  async function onSubmit(data: FormValues) {
    setServerError(null)

    let logo_url: string | null | undefined = undefined

    if (logoFile) {
      const url = await uploadLogo(entity.id, logoFile)
      if (!url) return
      logo_url = url
    } else if (removeLogoFlag) {
      logo_url = null
    }

    const result = await updateBusinessEntity(entity.id, {
      name:       data.name,
      cnpj:       data.cnpj || null,
      tax_regime: data.tax_regime || null,
      activity:   data.activity || null,
      logo_url,
    })

    if (result.error) {
      setServerError(result.error)
      return
    }

    if (result.data) {
      updateEntity(result.data)
      setLogoFile(null)
      setRemoveLogoFlag(false)
    }

    toast.success('Configurações da empresa salvas!')
    router.refresh()
  }

  const cnpjValue = watch('cnpj') ?? ''

  return (
    <div className="space-y-5">
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
          <ImageIcon className="w-4 h-4 text-gray-400" />
          Logo da empresa
        </h2>

        <div className="flex items-center gap-4">
          {/* Preview */}
          <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Logo"
                className="w-full h-full object-cover"
              />
            ) : (
              <Building2 className="w-6 h-6 text-gray-300" />
            )}
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
              >
                <Upload className="w-3.5 h-3.5" />
                {logoPreview ? 'Trocar logo' : 'Enviar logo'}
              </button>
              {logoPreview && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Remover
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">PNG, JPG ou WebP. Máximo 2 MB.</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
            <Building2 className="w-4 h-4 text-gray-400" />
            Dados da empresa
          </h2>

          {serverError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-700">{serverError}</p>
            </div>
          )}

          <div className="space-y-4 max-w-sm">
            {/* Nome */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nome da empresa <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('name')}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
              )}
            </div>

            {/* CNPJ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                CNPJ
                <span className="ml-1 text-xs font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={cnpjValue}
                onChange={(e: { target: { value: string } }) => setValue('cnpj', maskCNPJ(e.target.value), { shouldValidate: true })}
                placeholder="00.000.000/0000-00"
                className={cn(
                  'w-full px-3.5 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent',
                  errors.cnpj
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-blue-500'
                )}
              />
              {errors.cnpj ? (
                <p className="mt-1 text-xs text-red-600">{errors.cnpj.message}</p>
              ) : cnpjValue.replace(/\D/g, '').length === 14 && (
                <p className="mt-1 text-xs text-emerald-600">✓ CNPJ válido</p>
              )}
            </div>

            {/* Regime Tributário */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Regime tributário
              </label>
              <select
                {...register('tax_regime')}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="">— Não informado —</option>
                {TAX_REGIMES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Ramo de atividade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Ramo de atividade
              </label>
              <input
                type="text"
                {...register('activity')}
                placeholder="Ex: Desenvolvimento de software"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {errors.activity && (
                <p className="mt-1 text-xs text-red-600">{errors.activity.message}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || isUploadingLogo}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {(isSubmitting || isUploadingLogo) ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isUploadingLogo ? 'Enviando logo…' : 'Salvando…'}
              </>
            ) : (
              'Salvar configurações'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
