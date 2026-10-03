'use client'

import { useEffect, useState } from 'react'
import { Loader2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { scanHistoricalTransfers, approveHistoricalTransfers, type HistoricalPairView } from '@/lib/actions/transfers'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import type { Account } from '@/types'

const key = (p: HistoricalPairView) => `${p.out.id}:${p.in.id}`

/** "Revisar transferências antigas": pares propostos pelos sinais A e B, aprovados em lote. */
export function ReviewTransfersForm({
  accounts,
  onSuccess,
  onCancel,
}: {
  accounts: Account[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [proposals, setProposals] = useState<HistoricalPairView[]>([])
  const [ambiguousCount, setAmbiguousCount] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? '—'

  useEffect(() => {
    scanHistoricalTransfers().then(res => {
      setProposals(res.proposals)
      setAmbiguousCount(res.ambiguousCount)
      setSelected(new Set(res.proposals.map(key)))
      setLoading(false)
    })
  }, [])

  function toggle(k: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  async function handleApprove() {
    setSaving(true)
    const pairs = proposals.filter(p => selected.has(key(p))).map(p => ({ outId: p.out.id, inId: p.in.id }))
    const res = await approveHistoricalTransfers(pairs)
    setSaving(false)
    if (res.error) { toast.error(res.error); return }
    toast.success(`${res.linked} transferência${res.linked === 1 ? '' : 's'} vinculada${res.linked === 1 ? '' : 's'}`
      + (res.failed > 0 ? ` · ${res.failed} não puderam ser vinculadas` : ''))
    onSuccess()
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Procurando pares no histórico…</p>
        </div>
      ) : proposals.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          Nenhum par de transferência encontrado no histórico.
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            Saídas e entradas de mesmo valor, na mesma data, em contas diferentes. Ao vincular, deixam de contar como
            receita e despesa; os saldos das contas não mudam.
          </p>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
            {proposals.map(p => {
              const k = key(p)
              return (
                <label key={k} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selected.has(k)}
                    onChange={() => toggle(k)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="flex items-center gap-1.5 text-gray-800 font-medium">
                      <span className="truncate">{accountName(p.out.accountId)}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{accountName(p.in.accountId)}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {formatDate(p.out.date)} · {p.out.description ?? '—'} / {p.in.description ?? '—'}
                    </p>
                  </div>
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap',
                    p.status === 'matched' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700',
                  )}>
                    {p.status === 'matched' ? 'Confirmada' : 'Possível'}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-gray-700 shrink-0">{formatCurrency(p.out.amount)}</span>
                </label>
              )
            })}
          </div>
        </>
      )}

      {!loading && ambiguousCount > 0 && (
        <p className="text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-2">
          {ambiguousCount} transaç{ambiguousCount === 1 ? 'ão tem' : 'ões têm'} mais de um par possível e não
          {ambiguousCount === 1 ? ' foi proposta' : ' foram propostas'}. Use “Vincular como transferência” na lista para escolher o par.
        </p>
      )}

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
          Fechar
        </button>
        {proposals.length > 0 && (
          <button
            onClick={handleApprove}
            disabled={saving || selected.size === 0}
            className="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Vincular {selected.size} selecionad{selected.size === 1 ? 'o' : 'os'}
          </button>
        )}
      </div>
    </div>
  )
}
