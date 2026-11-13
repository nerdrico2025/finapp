'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { createAccount } from '@/lib/actions/accounts'
import type { Account, AccountType } from '@/types'

/** Tipos oferecidos na criação rápida (a partir da prévia da importação). */
export const QUICK_ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Conta corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'investment', label: 'Investimento' },
  { value: 'wallet', label: 'Carteira' },
  { value: 'credit_card', label: 'Cartão de crédito' },
]

/**
 * Mini diálogo "Criar conta" do select de conta destino. Cria na entidade
 * ativa (createAccount), saldo inicial 0. Falha (inclusive limite do plano)
 * vira toast e nada muda.
 */
export function QuickAccountDialog({ onCreated, onClose }: {
  onCreated: (account: Account) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('checking')
  const [saving, setSaving] = useState(false)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) { toast.error('Informe o nome da conta.'); return }
    setSaving(true)
    try {
      const res = await createAccount({ name: trimmed, type, color: '#6b7280', initial_balance: 0, include_in_total: true })
      if (res.error === 'LIMIT_REACHED') { toast.error(res.message ?? 'Limite de contas do seu plano atingido.'); return }
      if (res.error) { toast.error(`Não foi possível criar a conta: ${res.error}`); return }
      if (!res.account) { toast.error('A conta foi criada, mas não voltou do servidor. Recarregue a página.'); return }
      toast.success(`Conta "${res.account.name}" criada`)
      onCreated(res.account)
    } catch {
      toast.error('Não foi possível criar a conta. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/20" onClick={() => !saving && onClose()} />
      <div
        role="dialog"
        aria-label="Criar conta"
        className="relative w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-4 space-y-3"
        onKeyDown={e => { if (e.key === 'Escape' && !saving) { e.stopPropagation(); onClose() } }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">Criar conta</p>
          <button type="button" onClick={onClose} disabled={saving} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          autoFocus
          placeholder="Nome (ex.: Nubank, Mercado Pago)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          disabled={saving}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={type}
          onChange={e => setType(e.target.value as AccountType)}
          disabled={saving}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {QUICK_ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <p className="text-[11px] text-gray-500">Saldo inicial R$ 0,00 — ajuste depois em Contas.</p>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg bg-white hover:text-gray-800">
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 rounded-lg"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Criar
          </button>
        </div>
      </div>
    </div>
  )
}
