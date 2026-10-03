'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { setTransferDestination } from '@/lib/actions/transfers'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import type { Account } from '@/types'

/** "Definir conta destino" de uma transferência órfã. */
export function SetTransferDestinationForm({
  tx,
  accounts,
  onSuccess,
  onCancel,
}: {
  tx: { id: string; account_id: string; date: string; amount: number; description: string | null }
  accounts: Account[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const otherAccounts = accounts.filter(a => a.id !== tx.account_id)
  const [accountId, setAccountId] = useState(otherAccounts[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const originName = accounts.find(a => a.id === tx.account_id)?.name ?? '—'

  async function handleSubmit() {
    setSaving(true)
    const res = await setTransferDestination(tx.id, accountId)
    setSaving(false)
    if (res.error) { toast.error(res.error); return }
    onSuccess()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
        <p className="font-medium text-gray-900 truncate">{tx.description ?? 'Transferência'}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {formatDate(tx.date)} · saída de {formatCurrency(tx.amount)} de {originName}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Conta destino</label>
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {otherAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          O saldo de {originName} não muda; a conta destino passa a receber o valor.
        </p>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !accountId}
          className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Definir conta destino
        </button>
      </div>
    </div>
  )
}
