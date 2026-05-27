'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Check, Plus, X, Building2, User } from 'lucide-react'
import { toast } from 'sonner'
import { useEntityContext } from '@/contexts/EntityContext'
import { createBusinessEntity } from '@/lib/actions/entities'
import { cn } from '@/lib/utils/cn'
import type { Entity } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskCNPJ(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

// ─── Entity Avatar ─────────────────────────────────────────────────────────────

function EntityAvatar({ entity, size = 'md' }: { entity: Entity; size?: 'md' | 'sm' }) {
  const dim = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'

  if (entity.type === 'business' && entity.logo_url) {
    return (
      <img
        src={entity.logo_url}
        alt={entity.name}
        className={cn('rounded-sm object-cover shrink-0', dim)}
      />
    )
  }

  if (entity.type === 'business') {
    return <Building2 className={cn('shrink-0 text-blue-600', dim)} />
  }

  return <User className={cn('shrink-0 text-emerald-600', dim)} />
}

// ─── Context badge ────────────────────────────────────────────────────────────
// Always-visible pill showing PF (green) or PJ (blue) context.

function ContextBadge({ type }: { type: 'personal' | 'business' }) {
  return (
    <span className={cn(
      'text-[9px] font-bold rounded px-1.5 py-0.5 leading-none shrink-0 tabular-nums',
      type === 'business'
        ? 'bg-blue-100 text-blue-600'
        : 'bg-emerald-100 text-emerald-700'
    )}>
      {type === 'business' ? 'PJ' : 'PF'}
    </span>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function EntitySwitcher() {
  const { entities, activeEntity, setActiveEntity, addEntity, isLoading } = useEntityContext()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleSwitch(entity: Entity) {
    setOpen(false)
    if (entity.id === activeEntity?.id) return
    setActiveEntity(entity)
    router.refresh()
  }

  function handleAddCompany() {
    setOpen(false)
    setShowModal(true)
  }

  if (isLoading || !activeEntity) {
    return <div className="h-10 mx-3 mb-2 rounded-lg bg-gray-100 animate-pulse" />
  }

  const isBusinessEntity = activeEntity.type === 'business'

  return (
    <>
      <div className="relative px-3 pb-2" ref={dropdownRef}>
        {/* Context accent line */}
        <div className={cn(
          'absolute left-0 top-1 bottom-2 w-0.5 rounded-r-full transition-colors',
          isBusinessEntity ? 'bg-blue-500' : 'bg-emerald-500'
        )} />

        <button
          onClick={() => setOpen((v: boolean) => !v)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          <EntityAvatar entity={activeEntity} size="md" />
          <span className="flex-1 text-sm font-medium text-gray-800 truncate">
            {activeEntity.name}
          </span>
          <ContextBadge type={activeEntity.type as 'personal' | 'business'} />
          <ChevronDown
            className={cn('w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-40 py-1 overflow-hidden">
            {entities.map(entity => (
              <button
                key={entity.id}
                onClick={() => handleSwitch(entity)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left"
              >
                <EntityAvatar entity={entity} size="sm" />
                <span className="flex-1 text-gray-700 truncate">{entity.name}</span>
                <ContextBadge type={entity.type as 'personal' | 'business'} />
                {entity.id === activeEntity.id && (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />
                )}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={handleAddCompany}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors text-left"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                Adicionar empresa
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <AddCompanyModal
          onClose={() => setShowModal(false)}
          onCreated={(entity) => {
            addEntity(entity)
            setActiveEntity(entity)
            router.refresh()
            setShowModal(false)
          }}
        />
      )}
    </>
  )
}

// ─── Add Company Modal ─────────────────────────────────────────────────────────

interface AddCompanyModalProps {
  onClose: () => void
  onCreated: (entity: Entity) => void
}

function AddCompanyModal({ onClose, onCreated }: AddCompanyModalProps) {
  const [name, setName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const result = await createBusinessEntity({ name: name.trim(), cnpj: cnpj || undefined })
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      toast.success(`Empresa "${result.data.name}" criada!`)
      onCreated(result.data)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Adicionar empresa</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nome da empresa <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="Ex: Minha Empresa Ltda"
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              CNPJ <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={cnpj}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCnpj(maskCNPJ(e.target.value))}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
