'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, Upload, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight,
  X, Calculator, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { toast } from 'sonner'
import { formatCurrency, formatDate, parseCurrency } from '@/lib/utils/format'
import { ImportCSVForm } from '@/components/forms/ImportCSVForm'
import { CategoryDonutChart } from '@/components/charts/CategoryDonutChart'
import { cn } from '@/lib/utils/cn'
import { updateInvestmentBalance } from '@/lib/actions/investments'
import { TradeOperations } from './TradeOperations'
import type { Account, Category, TradeOperation } from '@/types'
import type { InvestmentData, HistoryPoint } from '@/lib/actions/investments'

interface Props {
  investmentData: InvestmentData
  allAccounts: Account[]
  categories: Category[]
  history: { points: HistoryPoint[]; accountIds: string[] }
  initialTrades: TradeOperation[]
}

type Tab = 'portfolio' | 'simulator' | 'trades'

const PERIODS = [
  { label: '1 ano',   years: 1  },
  { label: '3 anos',  years: 3  },
  { label: '5 anos',  years: 5  },
  { label: '10 anos', years: 10 },
  { label: '15 anos', years: 15 },
  { label: '20 anos', years: 20 },
  { label: '30 anos', years: 30 },
]

const LINE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']

function fmtPct(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(v) + '%'
}

function calcResults(pv: number, pmt: number, r: number) {
  if (r <= 0 || (pv <= 0 && pmt <= 0)) return []
  return PERIODS.map(({ label, years }) => {
    const n = years * 12
    const factor = Math.pow(1 + r, n)
    const final = pv * factor + pmt * ((factor - 1) / r)
    const invested = pv + pmt * n
    const interest = final - invested
    const pct = invested > 0 ? ((final - invested) / invested) * 100 : 0
    return { label, years, invested, interest, final, pct }
  })
}

export function InvestmentsClient({ investmentData, allAccounts, categories, history, initialTrades }: Props) {
  const router = useRouter()
  const [importOpen, setImportOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('portfolio')

  // Optimistic local state for accounts (updated after balance change)
  const [localAccounts, setLocalAccounts] = useState<Account[]>(investmentData.accounts)

  // Per-account popover state: accountId -> open
  const [openPopover, setOpenPopover] = useState<string | null>(null)
  // Per-account input value
  const [inputValues, setInputValues] = useState<Record<string, string>>({})

  const [isPending, startTransition] = useTransition()

  const { transactions } = investmentData
  const total = localAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)

  const largest = localAccounts.length > 0
    ? localAccounts.reduce((best, a) => (a.balance > best.balance ? a : best), localAccounts[0])
    : null

  const donutData = localAccounts.map((a) => ({
    id: a.id,
    name: a.name,
    value: a.balance,
    color: a.color,
    icon: a.icon,
  }))

  function openBalancePopover(account: Account) {
    const formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(account.balance)
    setInputValues((prev) => ({ ...prev, [account.id]: formatted }))
    setOpenPopover(account.id)
  }

  function handleConfirmBalance(account: Account) {
    const newBalance = parseCurrency(inputValues[account.id] ?? '0')

    startTransition(async () => {
      const result = await updateInvestmentBalance(account.id, newBalance)

      if (result.error) {
        toast.error(result.error)
        return
      }

      const diff = result.diff ?? 0

      if (diff === 0) {
        toast.info('Saldo já está atualizado')
      } else if (diff > 0) {
        toast.success(`✓ Rendimento de ${formatCurrency(diff)} registrado`)
      } else {
        toast.error(`✓ Perda de ${formatCurrency(Math.abs(diff))} registrada`)
      }

      // Optimistic update of local account balance
      setLocalAccounts((prev) =>
        prev.map((a) => a.id === account.id ? { ...a, balance: newBalance } : a)
      )

      setOpenPopover(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-gray-900">Investimentos</h1>
        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Upload className="w-4 h-4" />
          Importar extrato
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Total investido"
          value={formatCurrency(total)}
          icon={<TrendingUp className="w-4 h-4" />}
          iconBg="bg-emerald-50" iconColor="text-emerald-600" valueColor="text-emerald-600"
        />
        <SummaryCard
          label="Contas de investimento"
          value={String(localAccounts.length)}
          icon={<TrendingUp className="w-4 h-4" />}
          iconBg="bg-blue-50" iconColor="text-blue-600" valueColor="text-gray-900"
        />
        <SummaryCard
          label="Maior posição"
          value={largest ? formatCurrency(largest.balance) : '—'}
          sublabel={largest?.name}
          icon={<TrendingUp className="w-4 h-4" />}
          iconBg="bg-purple-50" iconColor="text-purple-600" valueColor="text-gray-900"
        />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('portfolio')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            activeTab === 'portfolio'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <TrendingUp className="w-4 h-4" />
          Portfólio
        </button>
        <button
          onClick={() => setActiveTab('trades')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            activeTab === 'trades'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <ArrowLeftRight className="w-4 h-4" />
          Operações
        </button>
        <button
          onClick={() => setActiveTab('simulator')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            activeTab === 'simulator'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Calculator className="w-4 h-4" />
          Simulador
        </button>
      </div>

      {/* Portfolio Tab */}
      {activeTab === 'portfolio' && (
        <>
          {localAccounts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
              <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400 mb-1">Nenhuma conta de investimento cadastrada.</p>
              <p className="text-xs text-gray-300">Crie uma conta do tipo &quot;Investimento&quot; na tela de Contas.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-5">Distribuição do patrimônio</h2>
                <CategoryDonutChart data={donutData} emptyText="Nenhuma conta de investimento" />
              </div>

              {/* Account list with balance update */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50">
                  <h2 className="text-sm font-semibold text-gray-900">Contas</h2>
                </div>
                <ul className="divide-y divide-gray-50">
                  {localAccounts.map((account, idx) => {
                    const pct = total > 0 ? (account.balance / total) * 100 : 0
                    const color = account.color ?? '#10b981'
                    const contributed = account.total_contributed ?? 0
                    const rentabilidade = account.balance - contributed
                    const rentPct = contributed > 0 ? (rentabilidade / contributed) * 100 : 0
                    const isPopoverOpen = openPopover === account.id

                    return (
                      <li key={account.id}>
                        <div className="px-5 py-4 flex items-center gap-4">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                            style={{ backgroundColor: `${color}20` }}
                          >
                            {account.icon ?? <TrendingUp className="w-4 h-4" style={{ color }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{account.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                              </div>
                              <span className="text-xs text-gray-400 shrink-0 w-10 text-right tabular-nums">
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                            {contributed > 0 && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className={cn(
                                  'text-xs font-medium tabular-nums',
                                  rentabilidade >= 0 ? 'text-emerald-600' : 'text-red-500'
                                )}>
                                  {rentabilidade >= 0 ? '+' : ''}{formatCurrency(rentabilidade)}
                                </span>
                                <span className={cn(
                                  'text-xs px-1.5 py-0.5 rounded-full font-medium tabular-nums',
                                  rentabilidade >= 0
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-red-50 text-red-500'
                                )}>
                                  {rentabilidade >= 0 ? '+' : ''}{fmtPct(rentPct)}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <p className="text-sm font-semibold tabular-nums text-gray-900">
                              {formatCurrency(account.balance)}
                            </p>
                            <button
                              onClick={() => isPopoverOpen ? setOpenPopover(null) : openBalancePopover(account)}
                              title="Atualizar saldo"
                              className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <RefreshCw className={cn('w-3.5 h-3.5', isPending && openPopover === account.id && 'animate-spin')} />
                            </button>
                          </div>
                        </div>

                        {/* Inline balance update form */}
                        {isPopoverOpen && (
                          <div className="mx-5 mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <p className="text-xs font-medium text-gray-500 mb-2">
                              Saldo atual em <span className="text-gray-700">{account.name}</span>
                            </p>
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none">R$</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  autoFocus
                                  value={inputValues[account.id] ?? ''}
                                  onChange={(e) => setInputValues((prev) => ({ ...prev, [account.id]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleConfirmBalance(account)
                                    if (e.key === 'Escape') setOpenPopover(null)
                                  }}
                                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                />
                              </div>
                              <button
                                onClick={() => handleConfirmBalance(account)}
                                disabled={isPending}
                                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setOpenPopover(null)}
                                className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 text-sm font-medium rounded-lg transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* Histórico de rentabilidade */}
              {history.points.length > 1 && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50">
                    <h2 className="text-sm font-semibold text-gray-900">Histórico de rentabilidade</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Saldo acumulado por conta ao longo do tempo</p>
                  </div>
                  <div className="p-5">
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={history.points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: '#9ca3af' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#9ca3af' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) =>
                            new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
                          }
                        />
                        <Tooltip
                          formatter={(value, name) => {
                            const account = localAccounts.find((a) => a.id === String(name))
                            return [formatCurrency(Number(value ?? 0)), account?.name ?? String(name)]
                          }}
                          labelFormatter={(label) => label}
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #f0f0f0' }}
                        />
                        {history.accountIds.map((id, i) => {
                          const account = localAccounts.find((a) => a.id === id)
                          const lineColor = account?.color ?? LINE_COLORS[i % LINE_COLORS.length]
                          return (
                            <Line
                              key={id}
                              type="monotone"
                              dataKey={id}
                              name={id}
                              stroke={lineColor}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                            />
                          )
                        })}
                        {history.accountIds.length > 1 && (
                          <Legend
                            formatter={(value: string) => {
                              const account = localAccounts.find((a) => a.id === value)
                              return account?.name ?? value
                            }}
                            wrapperStyle={{ fontSize: 12 }}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50">
                  <h2 className="text-sm font-semibold text-gray-900">Movimentações recentes</h2>
                </div>
                {transactions.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400">Nenhuma movimentação encontrada.</div>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {transactions.map((tx) => {
                      const isIncome = tx.type === 'income'
                      const isTransfer = tx.type === 'transfer'
                      return (
                        <li key={tx.id} className="flex items-center gap-3 px-5 py-3.5">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                            isIncome ? 'bg-emerald-100' : isTransfer ? 'bg-blue-100' : 'bg-red-100'
                          )}>
                            {isIncome
                              ? <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
                              : isTransfer
                                ? <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                                : <ArrowDownCircle className="w-4 h-4 text-red-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {tx.description ?? tx.category_name ?? (isTransfer ? 'Transferência' : isIncome ? 'Aplicação' : 'Resgate')}
                            </p>
                            <p className="text-xs text-gray-400">{formatDate(tx.date)} · {tx.account_name}</p>
                          </div>
                          <p className={cn(
                            'text-sm font-semibold tabular-nums shrink-0',
                            isIncome ? 'text-emerald-600' : isTransfer ? 'text-blue-600' : 'text-red-600'
                          )}>
                            {isIncome ? '+' : isTransfer ? '' : '-'}{formatCurrency(tx.amount)}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Trades Tab */}
      {activeTab === 'trades' && <TradeOperations initialTrades={initialTrades} />}

      {/* Simulator Tab */}
      {activeTab === 'simulator' && <InvestmentSimulator />}

      {/* Import Modal */}
      {importOpen && (
        <Modal title="Importar extrato" onClose={() => setImportOpen(false)} extraWide>
          <ImportCSVForm
            accounts={allAccounts}
            categories={categories}
            onSuccess={() => { toast.success('Transações importadas!'); setImportOpen(false); router.refresh() }}
            onCancel={() => setImportOpen(false)}
          />
        </Modal>
      )}
    </div>
  )
}

// ─── Investment Simulator ──────────────────────────────────────────────────────

function InvestmentSimulator() {
  const [pvStr,   setPvStr]   = useState('10.000,00')
  const [pmtStr,  setPmtStr]  = useState('500,00')
  const [rateStr, setRateStr] = useState('1,0')
  const [expanded, setExpanded] = useState<number | null>(null)

  const pv   = parseCurrency(pvStr)
  const pmt  = parseCurrency(pmtStr)
  const rate = parseCurrency(rateStr) / 100

  const results  = useMemo(() => calcResults(pv, pmt, rate), [pv, pmt, rate])
  const maxFinal = results.length > 0 ? Math.max(...results.map((r) => r.final)) : 1
  const annualRate = rate > 0 ? fmtPct((Math.pow(1 + rate, 12) - 1) * 100) : '—'
  const result30 = results[results.length - 1]

  function handleBlur(str: string, setter: (v: string) => void, decimals: number) {
    const n = parseCurrency(str)
    setter(new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n))
  }

  return (
    <div className="space-y-4">

      {/* Inputs */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Parâmetros da simulação</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Valor inicial</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none">R$</span>
              <input
                type="text" inputMode="decimal" value={pvStr}
                onChange={e => setPvStr(e.target.value)}
                onBlur={e => handleBlur(e.target.value, setPvStr, 2)}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Aporte mensal</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none">R$</span>
              <input
                type="text" inputMode="decimal" value={pmtStr}
                onChange={e => setPmtStr(e.target.value)}
                onBlur={e => handleBlur(e.target.value, setPmtStr, 2)}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Taxa mensal</label>
            <div className="relative">
              <input
                type="text" inputMode="decimal" value={rateStr}
                onChange={e => setRateStr(e.target.value)}
                onBlur={e => handleBlur(e.target.value, setRateStr, 1)}
                className="w-full pl-3 pr-8 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none">%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">≈ {annualRate} ao ano</p>
          </div>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-900">Projeção por período</h2>
            <p className="text-xs text-gray-400 mt-0.5">Clique em um período para ver o detalhamento</p>
          </div>
          <ul className="divide-y divide-gray-50">
            {results.map((res) => {
              const invPct = (res.invested / maxFinal) * 100
              const totPct = (res.final    / maxFinal) * 100
              const isOpen = expanded === res.years
              return (
                <li key={res.years}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : res.years)}
                    className="w-full px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-800">{res.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-emerald-600 tabular-nums">
                          {formatCurrency(res.final)}
                        </span>
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full tabular-nums">
                          +{fmtPct(res.pct)}
                        </span>
                        {isOpen
                          ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                      </div>
                    </div>
                    <div className="relative h-4 rounded-full overflow-hidden bg-gray-100">
                      <div className="absolute left-0 top-0 h-full rounded-full bg-emerald-100 transition-all duration-500"
                        style={{ width: `${totPct}%` }} />
                      <div className="absolute left-0 top-0 h-full rounded-full bg-blue-400 transition-all duration-500"
                        style={{ width: `${invPct}%` }} />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 grid grid-cols-3 gap-3">
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-1">Total investido</p>
                        <p className="text-sm font-bold text-blue-600 tabular-nums">{formatCurrency(res.invested)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-1">Juros ganhos</p>
                        <p className="text-sm font-bold text-emerald-600 tabular-nums">{formatCurrency(res.interest)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-1">Rendimento</p>
                        <p className="text-sm font-bold text-gray-800 tabular-nums">{fmtPct(res.pct)}</p>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-blue-400" />
              <span className="text-xs text-gray-400">Total investido</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-emerald-100" />
              <span className="text-xs text-gray-400">Juros compostos</span>
            </div>
          </div>
        </div>
      )}

      {/* 30-year highlight */}
      {result30 && (
        <div className="bg-emerald-600 rounded-2xl p-5 text-white">
          <p className="text-sm text-emerald-100 mb-1">Em 30 anos, seu patrimônio pode chegar a</p>
          <p className="text-3xl font-bold tabular-nums">{formatCurrency(result30.final)}</p>
          <p className="text-sm text-emerald-200 mt-2">
            {formatCurrency(result30.invested)} investidos →{' '}
            {formatCurrency(result30.interest)} em juros compostos ({fmtPct(result30.pct)} de ganho total)
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sublabel, icon, iconBg, iconColor, valueColor }: {
  label: string; value: string; sublabel?: string
  icon: React.ReactNode; iconBg: string; iconColor: string; valueColor: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', iconBg, iconColor)}>{icon}</div>
      </div>
      <p className={cn('text-xl font-bold tabular-nums leading-tight', valueColor)}>{value}</p>
      {sublabel && <p className="text-xs text-gray-400 mt-0.5 truncate">{sublabel}</p>}
    </div>
  )
}

function Modal({ title, onClose, children, wide, extraWide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; extraWide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        'relative bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto',
        extraWide ? 'w-full max-w-3xl' : wide ? 'w-full max-w-lg' : 'w-full max-w-md'
      )}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
