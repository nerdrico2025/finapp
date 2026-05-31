'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  Plus, Pencil, Trash2, TrendingUp, TrendingDown, Minus,
  X, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { createTrade, updateTrade, deleteTrade } from '@/lib/actions/trades'
import type { TradeOperation } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type TradeTab = 'swing' | 'options'
type Period = 'month' | '3m' | '6m' | 'year' | 'custom'
type OptionStatus = 'open' | 'exercised' | 'expired' | 'closed'

interface Props {
  initialTrades: TradeOperation[]
}

interface Calculated {
  invested: number
  resultado: number | null
  rentPct: number | null
  toTarget: number | null
  toStop: number | null
}

// ─── Calculations ─────────────────────────────────────────────────────────────

function calcTrade(t: TradeOperation): Calculated {
  if (t.type === 'swing') {
    const invested = t.entry_price * t.quantity
    if (t.status === 'closed' && t.exit_price != null) {
      const bruto = (t.exit_price - t.entry_price) * t.quantity
      const resultado = bruto - t.fees
      return {
        invested,
        resultado,
        rentPct: invested > 0 ? (resultado / invested) * 100 : null,
        toTarget: null,
        toStop: null,
      }
    }
    return {
      invested,
      resultado: null,
      rentPct: null,
      toTarget: t.target_price ? ((t.target_price - t.entry_price) / t.entry_price) * 100 : null,
      toStop: t.stop_loss ? ((t.stop_loss - t.entry_price) / t.entry_price) * 100 : null,
    }
  }

  // options — use premium as the cost basis
  const prem = t.premium ?? t.entry_price
  const invested = prem * t.quantity * 100
  if (t.option_status === 'expired') {
    const resultado = -invested - t.fees
    return {
      invested,
      resultado,
      rentPct: invested > 0 ? (resultado / invested) * 100 : null,
      toTarget: null,
      toStop: null,
    }
  }
  if ((t.option_status === 'exercised' || t.option_status === 'closed') && t.exit_price != null) {
    const resultado = (t.exit_price - prem) * t.quantity * 100 - t.fees
    return {
      invested,
      resultado,
      rentPct: invested > 0 ? (resultado / invested) * 100 : null,
      toTarget: null,
      toStop: null,
    }
  }
  return { invested, resultado: null, rentPct: null, toTarget: null, toStop: null }
}

// ─── Period helpers ───────────────────────────────────────────────────────────

function getPeriodRange(period: Period, custom: { start: string; end: string }) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]!
  if (period === 'custom') return { start: custom.start, end: custom.end }
  if (period === 'month') {
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return { start, end: today }
  }
  if (period === '3m') {
    const d = new Date(now); d.setMonth(d.getMonth() - 3)
    return { start: d.toISOString().split('T')[0]!, end: today }
  }
  if (period === '6m') {
    const d = new Date(now); d.setMonth(d.getMonth() - 6)
    return { start: d.toISOString().split('T')[0]!, end: today }
  }
  // year
  return { start: `${now.getFullYear()}-01-01`, end: today }
}

function fmtPct(v: number) {
  return (v >= 0 ? '+' : '') +
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + '%'
}

function fmtNum(v: number, decimals = 2) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}

const PERIOD_OPTS: { value: Period; label: string }[] = [
  { value: 'month', label: 'Este mês' },
  { value: '3m', label: 'Últ. 3 meses' },
  { value: '6m', label: 'Últ. 6 meses' },
  { value: 'year', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' },
]

const OPTION_STATUS_LABELS: Record<OptionStatus, string> = {
  open: 'Aberta',
  exercised: 'Exercida',
  expired: 'Virou pó',
  closed: 'Encerrada',
}

// ─── Empty form state ─────────────────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0]!

const emptySwing = (): FormState => ({
  type: 'swing',
  ticker: '', entry_date: today,
  exit_date: '', entry_price: '', exit_price: '', quantity: '',
  fees: '0', status: 'open', notes: '',
  stop_loss: '', target_price: '',
  option_type: 'call', option_series: '', expiration_date: '',
  premium: '', option_status: 'open',
})

const emptyOptions = (): FormState => ({
  type: 'options',
  ticker: '', entry_date: today,
  exit_date: '', entry_price: '', exit_price: '', quantity: '',
  fees: '0', status: 'open', notes: '',
  stop_loss: '', target_price: '',
  option_type: 'call', option_series: '', expiration_date: '',
  premium: '', option_status: 'open',
})

interface FormState {
  type: TradeTab
  ticker: string          // swing: stock (PETR4). options: underlying asset (PETR4)
  entry_date: string
  exit_date: string
  entry_price: string     // swing: entry price per share
  exit_price: string
  quantity: string
  fees: string
  status: 'open' | 'closed'
  notes: string
  stop_loss: string
  target_price: string
  option_type: 'call' | 'put'
  option_series: string   // options: series code (PETRA100)
  expiration_date: string // options: expiration date
  premium: string         // options: premium per share
  option_status: OptionStatus
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TradeOperations({ initialTrades }: Props) {
  const [trades, setTrades] = useState<TradeOperation[]>(initialTrades)
  const [activeTab, setActiveTab] = useState<TradeTab>('swing')
  const [period, setPeriod] = useState<Period>('year')
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TradeOperation | null>(null)
  const [formTab, setFormTab] = useState<TradeTab>('swing')
  const [form, setForm] = useState<FormState>(emptySwing())
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const { start: periodStart, end: periodEnd } = getPeriodRange(period, customRange)

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (!periodStart || !periodEnd) return true
      return t.entry_date >= periodStart && t.entry_date <= periodEnd
    })
  }, [trades, periodStart, periodEnd])

  const swingTrades = useMemo(() => filtered.filter((t) => t.type === 'swing'), [filtered])
  const optionsTrades = useMemo(() => filtered.filter((t) => t.type === 'options'), [filtered])

  const summaryTrades = filtered
  const calcs = useMemo(() => {
    const map = new Map<string, Calculated>()
    for (const t of summaryTrades) map.set(t.id, calcTrade(t))
    return map
  }, [summaryTrades])

  const { totalProfit, totalLoss, netResult, winRate, avgRent } = useMemo(() => {
    let profit = 0, loss = 0, wins = 0, total = 0, rentSum = 0
    for (const t of summaryTrades) {
      const c = calcs.get(t.id)
      if (c?.resultado != null) {
        total++
        if (c.resultado > 0) { profit += c.resultado; wins++ }
        else loss += c.resultado
        if (c.rentPct != null) rentSum += c.rentPct
      }
    }
    return {
      totalProfit: profit,
      totalLoss: loss,
      netResult: profit + loss,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      avgRent: total > 0 ? rentSum / total : null,
    }
  }, [summaryTrades, calcs])

  function openNew(tab: TradeTab) {
    setFormTab(tab)
    setEditing(null)
    setForm(tab === 'swing' ? emptySwing() : emptyOptions())
    setFormOpen(true)
  }

  function openEdit(t: TradeOperation) {
    setFormTab(t.type)
    setEditing(t)
    setForm({
      type: t.type,
      ticker: t.ticker,
      entry_date: t.entry_date,
      exit_date: t.exit_date ?? '',
      entry_price: fmtNum(t.entry_price, 4),
      exit_price: t.exit_price != null ? fmtNum(t.exit_price, 4) : '',
      quantity: fmtNum(t.quantity, 2),
      fees: fmtNum(t.fees, 2),
      status: t.status,
      notes: t.notes ?? '',
      stop_loss: t.stop_loss != null ? fmtNum(t.stop_loss, 4) : '',
      target_price: t.target_price != null ? fmtNum(t.target_price, 4) : '',
      option_type: t.option_type ?? 'call',
      option_series: t.option_series ?? '',
      expiration_date: t.expiration_date ?? '',
      premium: t.premium != null ? fmtNum(t.premium, 4) : '',
      option_status: (t.option_status as OptionStatus) ?? 'open',
    })
    setFormOpen(true)
  }

  function setF(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const previewCalc = useMemo((): Calculated => {
    const qty = parseNum(form.quantity)
    const ep = parseNum(form.entry_price)
    const xp = form.exit_price ? parseNum(form.exit_price) : null
    const fees = parseNum(form.fees)
    if (formTab === 'swing') {
      const invested = ep * qty
      if (form.status === 'closed' && xp != null) {
        const resultado = (xp - ep) * qty - fees
        return { invested, resultado, rentPct: invested > 0 ? (resultado / invested) * 100 : null, toTarget: null, toStop: null }
      }
      const tgt = form.target_price ? parseNum(form.target_price) : null
      const stp = form.stop_loss ? parseNum(form.stop_loss) : null
      return {
        invested,
        resultado: null,
        rentPct: null,
        toTarget: (tgt && ep > 0) ? ((tgt - ep) / ep) * 100 : null,
        toStop: (stp && ep > 0) ? ((stp - ep) / ep) * 100 : null,
      }
    }
    const prem = form.premium ? parseNum(form.premium) : ep
    const invested = prem * qty * 100
    if (form.option_status === 'expired') {
      const resultado = -invested - fees
      return { invested, resultado, rentPct: invested > 0 ? (resultado / invested) * 100 : null, toTarget: null, toStop: null }
    }
    if ((form.option_status === 'exercised' || form.option_status === 'closed') && xp != null) {
      const resultado = (xp - prem) * qty * 100 - fees
      return { invested, resultado, rentPct: invested > 0 ? (resultado / invested) * 100 : null, toTarget: null, toStop: null }
    }
    return { invested, resultado: null, rentPct: null, toTarget: null, toStop: null }
  }, [form, formTab])

  function handleSubmit() {
    const qty = parseNum(form.quantity)
    const ep = parseNum(form.entry_price)
    const prem = parseNum(form.premium)
    const priceOk = formTab === 'swing' ? ep > 0 : prem > 0
    if (!form.ticker || !form.entry_date || !priceOk || qty <= 0) {
      toast.error('Preencha os campos obrigatórios')
      return
    }

    const isClosed = formTab === 'swing' ? form.status === 'closed' : form.option_status !== 'open'
    const xp = form.exit_price ? parseNum(form.exit_price) : null

    const payload = {
      type: formTab,
      ticker: form.ticker.toUpperCase(),
      entry_date: form.entry_date,
      exit_date: (isClosed && form.exit_date) ? form.exit_date : null,
      entry_price: formTab === 'swing' ? ep : 0,
      exit_price: (isClosed && xp != null) ? xp : null,
      quantity: qty,
      fees: parseNum(form.fees),
      status: (isClosed ? 'closed' : 'open') as 'open' | 'closed',
      notes: form.notes || null,
      stop_loss: form.stop_loss ? parseNum(form.stop_loss) : null,
      target_price: form.target_price ? parseNum(form.target_price) : null,
      option_type: formTab === 'options' ? form.option_type : null,
      option_series: (formTab === 'options' && form.option_series) ? form.option_series : null,
      expiration_date: (formTab === 'options' && form.expiration_date) ? form.expiration_date : null,
      premium: (formTab === 'options' && form.premium) ? parseNum(form.premium) : null,
      option_status: formTab === 'options' ? form.option_status : null,
    }

    startTransition(async () => {
      if (editing) {
        const { error } = await updateTrade(editing.id, payload)
        if (error) { toast.error(error); return }
        setTrades((prev) => prev.map((t) => t.id === editing.id ? { ...t, ...payload } : t))
        toast.success('Operação atualizada')
      } else {
        const { error, id } = await createTrade(payload)
        if (error) { toast.error(error); return }
        const newTrade: TradeOperation = {
          id: id!, user_id: '', entity_id: null,
          type: payload.type,
          ticker: payload.ticker,
          entry_date: payload.entry_date,
          exit_date: payload.exit_date ?? null,
          entry_price: payload.entry_price,
          exit_price: payload.exit_price ?? null,
          quantity: payload.quantity,
          fees: payload.fees ?? 0,
          status: payload.status,
          notes: payload.notes ?? null,
          stop_loss: payload.stop_loss ?? null,
          target_price: payload.target_price ?? null,
          option_series: payload.option_series ?? null,
          option_type: payload.option_type ?? null,
          expiration_date: payload.expiration_date ?? null,
          premium: payload.premium ?? null,
          option_status: payload.option_status ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        setTrades((prev) => [newTrade, ...prev])
        toast.success('Operação registrada')
      }
      setFormOpen(false)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const { error } = await deleteTrade(id)
      if (error) { toast.error(error); return }
      setTrades((prev) => prev.filter((t) => t.id !== id))
      setDeleteConfirm(null)
      toast.success('Operação excluída')
    })
  }

  return (
    <div className="space-y-4">

      {/* Period filter */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-400 mr-1">Período:</span>
          {PERIOD_OPTS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                period === opt.value
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              {opt.label}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input
                type="date" value={customRange.start}
                onChange={(e) => setCustomRange((p) => ({ ...p, start: e.target.value }))}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-xs text-gray-400">até</span>
              <input
                type="date" value={customRange.end}
                onChange={(e) => setCustomRange((p) => ({ ...p, end: e.target.value }))}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="Lucro total" value={formatCurrency(totalProfit)} color="text-emerald-600" bg="bg-emerald-50" />
        <SummaryCard label="Prejuízo total" value={totalLoss < 0 ? `-${formatCurrency(Math.abs(totalLoss))}` : formatCurrency(0)} color="text-red-600" bg="bg-red-50" />
        <SummaryCard
          label="Resultado líquido"
          value={formatCurrency(netResult)}
          color={netResult >= 0 ? 'text-emerald-600' : 'text-red-600'}
          bg={netResult >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
        />
        <SummaryCard
          label="Rentab. média"
          value={avgRent != null ? fmtPct(avgRent) : '—'}
          color={avgRent == null ? 'text-gray-400' : avgRent >= 0 ? 'text-emerald-600' : 'text-red-600'}
          bg={avgRent == null ? 'bg-gray-50' : avgRent >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
        />
        <SummaryCard
          label="Taxa de acerto"
          value={fmtNum(winRate, 1) + '%'}
          color="text-blue-600"
          bg="bg-blue-50"
        />
      </div>

      {/* Inner tab: Swing | Opções */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['swing', 'options'] as TradeTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              activeTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {t === 'swing' ? 'Swing Trade' : 'Opções'}
          </button>
        ))}
      </div>

      {/* Swing Trade table */}
      {activeTab === 'swing' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Swing Trade</h2>
            <button
              onClick={() => openNew('swing')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova operação
            </button>
          </div>
          {swingTrades.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Nenhuma operação de Swing Trade no período.
            </div>
          ) : (
            <SwingTable
              trades={swingTrades}
              calcs={calcs}
              onEdit={openEdit}
              onDelete={(id) => setDeleteConfirm(id)}
            />
          )}
        </div>
      )}

      {/* Options table */}
      {activeTab === 'options' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Opções</h2>
            <button
              onClick={() => openNew('options')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova operação
            </button>
          </div>
          {optionsTrades.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Nenhuma operação de Opções no período.
            </div>
          ) : (
            <OptionsTable
              trades={optionsTrades}
              calcs={calcs}
              onEdit={openEdit}
              onDelete={(id) => setDeleteConfirm(id)}
            />
          )}
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <ModalOverlay onClose={() => setDeleteConfirm(null)}>
          <div className="p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Excluir operação?</h3>
            <p className="text-sm text-gray-500 mb-5">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={isPending}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Excluir
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-lg transition-colors border border-gray-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Form modal */}
      {formOpen && (
        <ModalOverlay onClose={() => setFormOpen(false)}>
          <TradeForm
            formTab={formTab}
            form={form}
            setF={setF}
            previewCalc={previewCalc}
            isPending={isPending}
            isEditing={!!editing}
            onSubmit={handleSubmit}
            onClose={() => setFormOpen(false)}
          />
        </ModalOverlay>
      )}
    </div>
  )
}

// ─── Swing Table ──────────────────────────────────────────────────────────────

function SwingTable({ trades, calcs, onEdit, onDelete }: {
  trades: TradeOperation[]
  calcs: Map<string, Calculated>
  onEdit: (t: TradeOperation) => void
  onDelete: (id: string) => void
}) {
  const open = trades.filter((t) => t.status === 'open')
  const closed = trades.filter((t) => t.status === 'closed')

  const totals = useMemo(() => {
    let profit = 0, loss = 0
    for (const t of closed) {
      const c = calcs.get(t.id)
      if (c?.resultado != null) {
        if (c.resultado > 0) profit += c.resultado
        else loss += c.resultado
      }
    }
    return { profit, loss, net: profit + loss, total: closed.length }
  }, [closed, calcs])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[900px]">
        <thead>
          <tr className="border-b border-gray-50 text-gray-400 font-medium">
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Ticker</th>
            <th className="px-4 py-3 text-left">Entrada</th>
            <th className="px-4 py-3 text-left">Saída</th>
            <th className="px-4 py-3 text-right">Qtd</th>
            <th className="px-4 py-3 text-right">P. entrada</th>
            <th className="px-4 py-3 text-right">P. saída</th>
            <th className="px-4 py-3 text-right">Stop</th>
            <th className="px-4 py-3 text-right">Target</th>
            <th className="px-4 py-3 text-right">Taxas</th>
            <th className="px-4 py-3 text-right">Resultado</th>
            <th className="px-4 py-3 text-right">Rent%</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {open.length > 0 && (
            <>
              <tr><td colSpan={13} className="px-4 py-2 bg-amber-50 text-amber-700 text-xs font-semibold">Em aberto ({open.length})</td></tr>
              {open.map((t) => {
                const c = calcs.get(t.id)
                return (
                  <tr key={t.id} className="border-t border-amber-50 bg-amber-50/30 hover:bg-amber-50/60">
                    <td className="px-4 py-2.5"><StatusBadge status="open" /></td>
                    <td className="px-4 py-2.5 font-semibold text-gray-900">{t.ticker}</td>
                    <td className="px-4 py-2.5 text-gray-600">{t.entry_date}</td>
                    <td className="px-4 py-2.5 text-gray-400">—</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(t.quantity, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(t.entry_price, 4)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">—</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-500">
                      {t.stop_loss != null ? (
                        <span title={`${c?.toStop != null ? fmtPct(c.toStop) : ''}`}>
                          {fmtNum(t.stop_loss, 2)}
                          {c?.toStop != null && <span className="ml-1 text-red-400">({fmtPct(c.toStop)})</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">
                      {t.target_price != null ? (
                        <span>
                          {fmtNum(t.target_price, 2)}
                          {c?.toTarget != null && <span className="ml-1 text-emerald-500">({fmtPct(c.toTarget)})</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(t.fees, 2)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">Em aberto</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">—</td>
                    <td className="px-4 py-2.5 text-right"><RowActions onEdit={() => onEdit(t)} onDelete={() => onDelete(t.id)} /></td>
                  </tr>
                )
              })}
            </>
          )}
          {closed.length > 0 && (
            <>
              <tr><td colSpan={13} className="px-4 py-2 bg-gray-50 text-gray-500 text-xs font-semibold">Encerradas ({closed.length})</td></tr>
              {closed.map((t) => {
                const c = calcs.get(t.id)
                const pos = c?.resultado != null && c.resultado >= 0
                return (
                  <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5"><StatusBadge status="closed" /></td>
                    <td className="px-4 py-2.5 font-semibold text-gray-900">{t.ticker}</td>
                    <td className="px-4 py-2.5 text-gray-600">{t.entry_date}</td>
                    <td className="px-4 py-2.5 text-gray-600">{t.exit_date ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(t.quantity, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(t.entry_price, 4)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{t.exit_price != null ? fmtNum(t.exit_price, 4) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{t.stop_loss != null ? fmtNum(t.stop_loss, 2) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{t.target_price != null ? fmtNum(t.target_price, 2) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(t.fees, 2)}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold', c?.resultado != null ? (pos ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400')}>
                      {c?.resultado != null ? (pos ? '+' : '') + formatCurrency(c.resultado) : '—'}
                    </td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold', c?.rentPct != null ? (pos ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400')}>
                      {c?.rentPct != null ? fmtPct(c.rentPct) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right"><RowActions onEdit={() => onEdit(t)} onDelete={() => onDelete(t.id)} /></td>
                  </tr>
                )
              })}
            </>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-100 bg-gray-50 font-semibold text-xs">
            <td colSpan={10} className="px-4 py-3 text-gray-500">{closed.length} operação(ões) encerrada(s)</td>
            <td className="px-4 py-3 text-right">
              <span className={totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                {(totals.net >= 0 ? '+' : '') + formatCurrency(totals.net)}
              </span>
            </td>
            <td colSpan={2} className="px-4 py-3 text-right text-gray-400">
              L: <span className="text-emerald-600">{formatCurrency(totals.profit)}</span>{' '}
              P: <span className="text-red-600">{totals.loss < 0 ? `-${formatCurrency(Math.abs(totals.loss))}` : '—'}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Options Table ─────────────────────────────────────────────────────────────

function OptionsTable({ trades, calcs, onEdit, onDelete }: {
  trades: TradeOperation[]
  calcs: Map<string, Calculated>
  onEdit: (t: TradeOperation) => void
  onDelete: (id: string) => void
}) {
  const open = trades.filter((t) => t.option_status === 'open')
  const exercised = trades.filter((t) => t.option_status === 'exercised')
  const expired = trades.filter((t) => t.option_status === 'expired')
  const closed = trades.filter((t) => t.option_status === 'closed')

  function GroupHeader({ label, count, color }: { label: string; count: number; color: string }) {
    return (
      <tr><td colSpan={13} className={cn('px-4 py-2 text-xs font-semibold', color)}>{label} ({count})</td></tr>
    )
  }

  function OptionRow({ t }: { t: TradeOperation }) {
    const c = calcs.get(t.id)
    const pos = c?.resultado != null && c.resultado >= 0
    const isExpired = t.option_status === 'expired'
    return (
      <tr className="border-t border-gray-50 hover:bg-gray-50">
        <td className="px-4 py-2.5">
          {isExpired
            ? <span className="text-xs font-semibold text-red-600">💀 Virou pó</span>
            : <OptionStatusBadge status={t.option_status as OptionStatus} />}
        </td>
        <td className="px-4 py-2.5 font-semibold text-gray-900">{t.ticker}</td>
        <td className="px-4 py-2.5 text-gray-700">{t.option_series ?? '—'}</td>
        <td className="px-4 py-2.5">
          {t.option_type && (
            <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded', t.option_type === 'call' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
              {t.option_type.toUpperCase()}
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-gray-600">{t.expiration_date ?? '—'}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(t.quantity, 0)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(t.entry_price, 4)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{t.exit_price != null ? fmtNum(t.exit_price, 4) : '—'}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(t.fees, 2)}</td>
        <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold', c?.resultado != null ? (pos ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400')}>
          {c?.resultado != null ? (pos ? '+' : '') + formatCurrency(c.resultado) : 'Em aberto'}
        </td>
        <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold', c?.rentPct != null ? (pos ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400')}>
          {c?.rentPct != null ? fmtPct(c.rentPct) : '—'}
        </td>
        <td className="px-4 py-2.5 text-right"><RowActions onEdit={() => onEdit(t)} onDelete={() => onDelete(t.id)} /></td>
      </tr>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[900px]">
        <thead>
          <tr className="border-b border-gray-50 text-gray-400 font-medium">
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Ativo obj.</th>
            <th className="px-4 py-3 text-left">Série</th>
            <th className="px-4 py-3 text-left">Tipo</th>
            <th className="px-4 py-3 text-left">Vencimento</th>
            <th className="px-4 py-3 text-right">Contratos</th>
            <th className="px-4 py-3 text-right">Prêmio</th>
            <th className="px-4 py-3 text-right">P. saída</th>
            <th className="px-4 py-3 text-right">Taxas</th>
            <th className="px-4 py-3 text-right">Resultado</th>
            <th className="px-4 py-3 text-right">Rent%</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {open.length > 0 && (
            <>
              <GroupHeader label="Em aberto" count={open.length} color="bg-amber-50 text-amber-700" />
              {open.map((t) => <OptionRow key={t.id} t={t} />)}
            </>
          )}
          {exercised.length > 0 && (
            <>
              <GroupHeader label="Exercidas" count={exercised.length} color="bg-emerald-50 text-emerald-700" />
              {exercised.map((t) => <OptionRow key={t.id} t={t} />)}
            </>
          )}
          {closed.length > 0 && (
            <>
              <GroupHeader label="Encerradas manualmente" count={closed.length} color="bg-gray-50 text-gray-600" />
              {closed.map((t) => <OptionRow key={t.id} t={t} />)}
            </>
          )}
          {expired.length > 0 && (
            <>
              <GroupHeader label="💀 Virou pó" count={expired.length} color="bg-red-50 text-red-700" />
              {expired.map((t) => <OptionRow key={t.id} t={t} />)}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Trade Form ───────────────────────────────────────────────────────────────

function TradeForm({ formTab, form, setF, previewCalc, isPending, isEditing, onSubmit, onClose }: {
  formTab: TradeTab
  form: FormState
  setF: (field: keyof FormState, value: string) => void
  previewCalc: Calculated
  isPending: boolean
  isEditing: boolean
  onSubmit: () => void
  onClose: () => void
}) {
  const isClosed = formTab === 'swing' ? form.status === 'closed' : form.option_status !== 'open'

  return (
    <div className="w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900">
          {isEditing ? 'Editar' : 'Nova'} operação — {formTab === 'swing' ? 'Swing Trade' : 'Opções'}
        </h2>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        {formTab === 'swing' ? (
          <>
            <FormRow label="Ticker *">
              <input
                type="text" value={form.ticker} placeholder="PETR4"
                onChange={(e) => setF('ticker', e.target.value.toUpperCase())}
                className={inputCls}
              />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Data entrada *">
                <input type="date" value={form.entry_date} onChange={(e) => setF('entry_date', e.target.value)} className={inputCls} />
              </FormRow>
              <FormRow label="Status">
                <ToggleGroup
                  value={form.status}
                  options={[{ value: 'open', label: 'Aberta' }, { value: 'closed', label: 'Encerrada' }]}
                  onChange={(v) => setF('status', v)}
                />
              </FormRow>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Preço entrada *">
                <input type="text" inputMode="decimal" value={form.entry_price} onChange={(e) => setF('entry_price', e.target.value)} className={inputCls} placeholder="0,00" />
              </FormRow>
              <FormRow label="Quantidade *">
                <input type="text" inputMode="decimal" value={form.quantity} onChange={(e) => setF('quantity', e.target.value)} className={inputCls} placeholder="100" />
              </FormRow>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Stop loss">
                <input type="text" inputMode="decimal" value={form.stop_loss} onChange={(e) => setF('stop_loss', e.target.value)} className={inputCls} placeholder="—" />
              </FormRow>
              <FormRow label="Target / Alvo">
                <input type="text" inputMode="decimal" value={form.target_price} onChange={(e) => setF('target_price', e.target.value)} className={inputCls} placeholder="—" />
              </FormRow>
            </div>
            <FormRow label="Taxas / Corretagem">
              <input type="text" inputMode="decimal" value={form.fees} onChange={(e) => setF('fees', e.target.value)} className={inputCls} />
            </FormRow>
            {isClosed && (
              <div className="grid grid-cols-2 gap-3">
                <FormRow label="Data saída">
                  <input type="date" value={form.exit_date} onChange={(e) => setF('exit_date', e.target.value)} className={inputCls} />
                </FormRow>
                <FormRow label="Preço saída">
                  <input type="text" inputMode="decimal" value={form.exit_price} onChange={(e) => setF('exit_price', e.target.value)} className={inputCls} placeholder="0,00" />
                </FormRow>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Ativo objeto *">
                <input type="text" value={form.ticker} placeholder="PETR4" onChange={(e) => setF('ticker', e.target.value.toUpperCase())} className={inputCls} />
              </FormRow>
              <FormRow label="Série da opção *">
                <input type="text" value={form.option_series} placeholder="PETRA100" onChange={(e) => setF('option_series', e.target.value.toUpperCase())} className={inputCls} />
              </FormRow>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Tipo">
                <ToggleGroup
                  value={form.option_type}
                  options={[{ value: 'call', label: 'Call' }, { value: 'put', label: 'Put' }]}
                  onChange={(v) => setF('option_type', v)}
                />
              </FormRow>
              <FormRow label="Vencimento">
                <input type="date" value={form.expiration_date} onChange={(e) => setF('expiration_date', e.target.value)} className={inputCls} />
              </FormRow>
            </div>
            <FormRow label="Data entrada *">
              <input type="date" value={form.entry_date} onChange={(e) => setF('entry_date', e.target.value)} className={inputCls} />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Nº contratos *">
                <input type="text" inputMode="decimal" value={form.quantity} onChange={(e) => setF('quantity', e.target.value)} className={inputCls} placeholder="1" />
              </FormRow>
              <FormRow label="Prêmio / ação *">
                <input type="text" inputMode="decimal" value={form.premium} onChange={(e) => setF('premium', e.target.value)} className={inputCls} placeholder="0,0000" />
              </FormRow>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Taxas">
                <input type="text" inputMode="decimal" value={form.fees} onChange={(e) => setF('fees', e.target.value)} className={inputCls} />
              </FormRow>
              <FormRow label="Status da opção">
                <div className="relative">
                  <select
                    value={form.option_status}
                    onChange={(e) => setF('option_status', e.target.value)}
                    className={inputCls + ' appearance-none pr-7'}
                  >
                    <option value="open">Aberta</option>
                    <option value="exercised">Exercida</option>
                    <option value="closed">Encerrada manualmente</option>
                    <option value="expired">Virou pó 💀</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </FormRow>
            </div>
            {isClosed && form.option_status !== 'expired' && (
              <div className="grid grid-cols-2 gap-3">
                <FormRow label="Data saída">
                  <input type="date" value={form.exit_date} onChange={(e) => setF('exit_date', e.target.value)} className={inputCls} />
                </FormRow>
                <FormRow label="Preço saída">
                  <input type="text" inputMode="decimal" value={form.exit_price} onChange={(e) => setF('exit_price', e.target.value)} className={inputCls} placeholder="0,0000" />
                </FormRow>
              </div>
            )}
          </>
        )}

        <FormRow label="Observações">
          <textarea value={form.notes} onChange={(e) => setF('notes', e.target.value)} rows={2} className={inputCls + ' resize-none'} placeholder="Opcional" />
        </FormRow>

        {/* Preview */}
        <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-gray-400 mb-0.5">Investido</p>
            <p className="font-semibold text-gray-700 tabular-nums">{formatCurrency(previewCalc.invested)}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">Resultado</p>
            <p className={cn('font-semibold tabular-nums', previewCalc.resultado != null ? (previewCalc.resultado >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400')}>
              {previewCalc.resultado != null ? (previewCalc.resultado >= 0 ? '+' : '') + formatCurrency(previewCalc.resultado) : 'Em aberto'}
            </p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">Rentab.</p>
            <p className={cn('font-semibold tabular-nums', previewCalc.rentPct != null ? (previewCalc.rentPct >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400')}>
              {previewCalc.rentPct != null ? fmtPct(previewCalc.rentPct) : '—'}
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onSubmit}
            disabled={isPending}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {isPending ? 'Salvando...' : (isEditing ? 'Salvar alterações' : 'Registrar operação')}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-xl transition-colors border border-gray-200"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent'

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function ToggleGroup({ value, options, onChange }: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
      {options.map((opt) => (
        <button
          key={opt.value} type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
            value === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: 'open' | 'closed' }) {
  return (
    <span className={cn(
      'inline-block text-xs font-semibold px-1.5 py-0.5 rounded-full',
      status === 'open' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
    )}>
      {status === 'open' ? 'Aberta' : 'Encerrada'}
    </span>
  )
}

function OptionStatusBadge({ status }: { status: OptionStatus }) {
  const map: Record<OptionStatus, string> = {
    open: 'bg-amber-100 text-amber-700',
    exercised: 'bg-emerald-100 text-emerald-700',
    expired: 'bg-red-100 text-red-700',
    closed: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={cn('inline-block text-xs font-semibold px-1.5 py-0.5 rounded-full', map[status])}>
      {OPTION_STATUS_LABELS[status]}
    </span>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1 justify-end">
      <button onClick={onEdit} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function SummaryCard({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <div className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full', bg)}>
        <p className={cn('text-sm font-bold tabular-nums', color)}>{value}</p>
      </div>
    </div>
  )
}

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl">
        {children}
      </div>
    </div>
  )
}
