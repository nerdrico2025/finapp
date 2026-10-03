'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getTransferLinkCandidates, linkAsTransfer, type LinkCandidate } from '@/lib/actions/transfers'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { Account } from '@/types'
import type { TransactionWithRelations } from '@/lib/actions/transactions'

/**
 * "Vincular como transferência": escolhe a contraparte já registrada em outra
 * conta, ou só a conta — nesse caso a outra perna é criada como pendente.
 */
export function LinkTransferForm({
  tx,
  accounts,
  onSuccess,
  onCancel,
}: {
  tx: TransactionWithRelations
  accounts: Account[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [candidates, setCandidates] = useState<LinkCandidate[]>([])
  // id de uma contraparte, ou 'account' para vincular só à conta escolhida.
  const [choice, setChoice] = useState<string>('account')
  const [accountId, setAccountId] = useState('')

  const otherAccounts = accounts.filter(a => a.id !== tx.account_id)
  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? '—'
  const isOutflow = tx.type === 'expense'

  useEffect(() => {
    getTransferLinkCandidates(tx.id).then(res => {
      setCandidates(res.candidates)
      // Pré-seleciona só quando não há dúvida: um único candidato na mesma data.
      const exact = res.candidates.filter(c => c.exact)
      if (exact.length === 1) setChoice(exact[0].id)
      setAccountId(res.suggestedAccountId ?? otherAccounts[0]?.id ?? '')
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.id])

  async function handleSubmit() {
    setSaving(true)
    const res = choice === 'account'
      ? await linkAsTransfer(tx.id, { accountId })
      : await linkAsTransfer(tx.id, { counterpartId: choice })
    setSaving(false)
    if (res.error) { toast.error(res.error); return }
    onSuccess()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
        <p className="font-medium text-gray-900 truncate">{tx.description ?? 'Sem descrição'}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {formatDate(tx.date)} · {tx.account?.name} · {isOutflow ? 'saída' : 'entrada'} de {formatCurrency(tx.amount)}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">
            {isOutflow ? 'Para onde foi o dinheiro?' : 'De onde veio o dinheiro?'}
          </p>
          {candidates.map(c => (
            <label
              key={c.id}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm',
                choice === c.id ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <input type="radio" checked={choice === c.id} onChange={() => setChoice(c.id)} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block font-medium text-gray-800 truncate">{c.description ?? 'Sem descrição'}</span>
                <span className="block text-xs text-gray-500">
                  {accountName(c.accountId)} · {formatDate(c.date)} · {formatCurrency(c.amount)}
                  {c.exact && <span className="ml-1 text-emerald-600 font-medium">· mesma data</span>}
                </span>
              </span>
            </label>
          ))}
          <label
            className={cn(
              'flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm',
              choice === 'account' ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50',
            )}
          >
            <input type="radio" checked={choice === 'account'} onChange={() => setChoice('account')} className="mt-0.5" />
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-gray-800">
                {candidates.length > 0 ? 'Outra conta, ainda sem o lançamento' : 'Conta da outra ponta'}
              </span>
              <select
                value={accountId}
                onChange={e => { setAccountId(e.target.value); setChoice('account') }}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
              >
                {otherAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <span className="block text-xs text-gray-500 mt-1">
                O lançamento da outra conta é criado agora e confirmado quando o extrato dela for importado.
              </span>
            </span>
          </label>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading || saving || (choice === 'account' && !accountId)}
          className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Vincular
        </button>
      </div>
    </div>
  )
}
