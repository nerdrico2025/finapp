'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, Upload, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, X,
  Calculator, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate, parseCurrency } from '@/lib/utils/format'
import { ImportCSVForm } from '@/components/forms/ImportCSVForm'
import { CategoryDonutChart } from '@/components/charts/CategoryDonutChart'
import { cn } from '@/lib/utils/cn'
import type { Account, Category } from '@/types'
import type { InvestmentData } from '@/lib/actions/investments'

interface Props {
  investmentData: InvestmentData
  allAccounts: Account[]
  categories: Category[]
}

export function InvestmentsClient({ investmentData, allAccounts, categories }: Props) {
  const router = useRouter()
  const [importOpen, setImportOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'portfolio' | 'simulator'>('portfolio')

  const { accounts, transactions, total } = investmentData

  const largest = accounts.length > 0
    ? accounts.reduce((best, a) => (a.balance > best.balance ? a : best), accounts[0])
    : null

  const donutData = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    value: a.balance,
    color: a.color,
    icon: a.icon,
  }))

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
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

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Total investido"
          value={formatCurrency(total)}
          icon={<TrendingUp className="w-4 h-4" />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          valueColor="text-emerald-600"
        />
        <SummaryCard
          label="Contas de investimento"
          value={String(accounts.length)}
          icon={<TrendingUp className="w-4 h-4" />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          valueColor="text-gray-900"
        />
        <SummaryCard
          label="Maior posição"
          value={largest ? formatCurrency(largest.balance) : '—'}
          sublabel={largest?.name}
          icon={<TrendingUp className="w-4 h-4" />}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          valueColor="text-gray-900"
        />
      </div>

      {/* ── Tab Selector ─────────────────────────────────────────────────── */}
      <div className="bg-gray-100 p-1 rounded-xl flex gap-1">
        <button
          onClick={() => setActiveTab('portfolio')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'portfolio'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <TrendingUp className="w-4 h-4" />
          Portfólio
        </button>
        <button
          onClick={() => setActiveTab('simulator')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'simulator'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Calculator className="w-4 h-4" />
          Simulador
        </button>
      </div>

      {activeTab === 'portfolio' && (
        <>
          {accounts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
              <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400 mb-1">Nenhuma conta de investimento cadastrada.</p>
              <p className="text-xs text-gray-300">Crie uma conta do tipo "Investimento" na tela de Contas.</p>
            </div>
          ) : (
            <>
              {/* ── Distribution Chart ───────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-5">
                  Distribuição do patrimônio
                </h2>
                <CategoryDonutChart data={donutData} emptyText="Nenhuma conta de investimento" />
              </div>

              {/* ── Account Cards ────────────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50">
                  <h2 className="text-sm font-semibold text-gray-900">Contas</h2>
                </div>
                <ul className="divide-y divide-gray-50">
                  {accounts.map((account) => {
                    const pct = total > 0 ? (account.balance / total) * 100 : 0
                    const color = account.color ?? '#10b981'
                    return (
                      <li key={account.id} className="px-5 py-4 flex items-center gap-4">
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
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: color }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 shrink-0 w-10 text-right tabular-nums">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <p className="text-sm font-semibold tabular-nums text-gray-900 shrink-0">
                          {formatCurrency(account.balance)}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* ── Transaction History ──────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50">
                  <h2 className="text-sm font-semibold text-gray-900">Movimentações recentes</h2>
                </div>

                {transactions.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400">
                    Nenhuma movimentação encontrada.
                  </div>
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
                                : <ArrowDownCircle className="w-4 h-4 text-red-600" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {tx.description ?? tx.category_name ?? (isTransfer ? 'Transferência' : isIncome ? 'Aplicação' : 'Resgate')}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatDate(tx.date)} · {tx.account_name}
                            </p>
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

      {activeTab === 'simulator' && <InvestmentSimulator />}

      {/* ── Import Modal ─────────────────────────────────────────────────── */}
      {importOpen && (
        <Modal title="Importar extrato" onClose={() => setImportOpen(false)} extraWide>
          <ImportCSVForm
            accounts={allAccounts}
            categories={categories}
            onSuccess={() => {
              toast.success('Transações importadas!')
              setImportOpen(false)
              router.refresh()
            }}
            onCancel={() => setImportOpen(false)}
          />
        </Modal>
      )}
    </div>
  )
}

// ─── Investment Simulator ──────────────────────────────────────────────────────

const PERIODS = [1, 3, 5, 10, 15, 20, 30] as const

function fmtBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function InvestmentSimulator() {
  const [pvRaw, setPvRaw] = useState('0,00')
  const [pmtRaw, setPmtRaw] = useState('0,00')
  const [rateRaw, setRateRaw] = useState('1,00')
  const [expanded, setExpanded] = useState<number | null>(null)

  const pv = parseCurrency(pvRaw)
  const pmt = parseCurrency(pmtRaw)
  const r = parseCurrency(rateRaw) / 100

  const annualRate = r > 0 ? ((1 + r) ** 12 - 1) * 100 : 0

  function calcFV(years: number) {
    const n = years * 12
    const factor = (1 + r) ** n
    const fv = r === 0
      ? pv + pmt * n
      : pv * factor + pmt * ((factor - 1) / r)
    const invested = pv + pmt * n
    const interest = fv - invested
    return { fv, invested, interest }
  }

  const results = PERIODS.map((y) => ({ years: y, ...calcFV(y) }))
  const maxFV = Math.max(...results.map((r) => r.fv), 1)

  function handleBlurCurrency(raw: string, set: (v: string) => void) {
    const num = parseCurrency(raw)
    set(fmtBRL(num))
  }

  function handleBlurRate(raw: string) {
    const num = parseCurrency(raw)
    setRateRaw(fmtBRL(num))
  }

  const result30 = results.find((r) => r.years === 30)!

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Parâmetros</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Valor Inicial */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Valor Inicial</label>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
              <span className="px-3 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 py-2.5 shrink-0">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={pvRaw}
                onChange={(e) => setPvRaw(e.target.value)}
                onBlur={() => handleBlurCurrency(pvRaw, setPvRaw)}
                className="flex-1 px-3 py-2.5 text-sm text-gray-900 tabular-nums outline-none bg-white"
              />
            </div>
          </div>

          {/* Aporte Mensal */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Aporte Mensal</label>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
              <span className="px-3 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 py-2.5 shrink-0">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={pmtRaw}
                onChange={(e) => setPmtRaw(e.target.value)}
                onBlur={() => handleBlurCurrency(pmtRaw, setPmtRaw)}
                className="flex-1 px-3 py-2.5 text-sm text-gray-900 tabular-nums outline-none bg-white"
              />
            </div>
          </div>

          {/* Taxa Mensal */}
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Taxa Mensal</label>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
              <input
                type="text"
                inputMode="decimal"
                value={rateRaw}
                onChange={(e) => setRateRaw(e.target.value)}
                onBlur={() => handleBlurRate(rateRaw)}
                className="flex-1 px-3 py-2.5 text-sm text-gray-900 tabular-nums outline-none bg-white"
              />
              <span className="px-3 text-sm text-gray-400 bg-gray-50 border-l border-gray-200 py-2.5 shrink-0">%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1 tabular-nums">
              ≈ {fmtBRL(annualRate)}% ao ano
            </p>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">Projeção por período</h2>
        </div>
        <ul className="divide-y divide-gray-50">
          {results.map(({ years, fv, invested, interest }) => {
            const gainPct = invested > 0 ? ((fv / invested - 1) * 100) : 0
            const investedWidth = maxFV > 0 ? (invested / maxFV) * 100 : 0
            const interestWidth = maxFV > 0 ? (interest / maxFV) * 100 : 0
            const isOpen = expanded === years
            return (
              <li key={years}>
                <button
                  onClick={() => setExpanded(isOpen ? null : years)}
                  className="w-full px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-14 shrink-0">
                      <p className="text-sm font-semibold text-gray-900">{years} {years === 1 ? 'ano' : 'anos'}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className="text-sm font-semibold tabular-nums text-gray-900">
                          {formatCurrency(fv)}
                        </p>
                        {gainPct > 0 && (
                          <span className="text-xs font-medium tabular-nums px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            +{fmtBRL(gainPct)}%
                          </span>
                        )}
                      </div>
                      <div className="h-2 rounded-full overflow-hidden bg-gray-100 flex">
                        <div className="h-full bg-blue-400 rounded-l-full" style={{ width: `${investedWidth}%` }} />
                        <div className="h-full bg-emerald-100" style={{ width: `${interestWidth}%` }} />
                      </div>
                    </div>
                    <div className="shrink-0 text-gray-400">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-4 grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-blue-500 font-medium mb-1">Total investido</p>
                      <p className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(invested)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-emerald-600 font-medium mb-1">Juros ganhos</p>
                      <p className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(interest)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500 font-medium mb-1">Rendimento</p>
                      <p className="text-sm font-semibold tabular-nums text-gray-900">{fmtBRL(gainPct)}%</p>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* 30-year highlight */}
      <div className="bg-emerald-600 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="w-4 h-4 text-emerald-200" />
          <p className="text-sm font-medium text-emerald-100">Resultado em 30 anos</p>
        </div>
        <p className="text-3xl font-bold tabular-nums mb-1">{formatCurrency(result30.fv)}</p>
        <div className="flex items-center gap-4 mt-2 text-sm text-emerald-100">
          <span>Investido: <span className="font-semibold tabular-nums text-white">{formatCurrency(result30.invested)}</span></span>
          <span>Juros: <span className="font-semibold tabular-nums text-white">{formatCurrency(result30.interest)}</span></span>
        </div>
        {result30.invested > 0 && (
          <p className="text-xs text-emerald-200 mt-1 tabular-nums">
            Ganho total de {fmtBRL((result30.fv / result30.invested - 1) * 100)}%
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sublabel, icon, iconBg, iconColor, valueColor,
}: {
  label: string
  value: string
  sublabel?: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  valueColor: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', iconBg, iconColor)}>
          {icon}
        </div>
      </div>
      <p className={cn('text-xl font-bold tabular-nums leading-tight', valueColor)}>{value}</p>
      {sublabel && <p className="text-xs text-gray-400 mt-0.5 truncate">{sublabel}</p>}
    </div>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

function Modal({
  title, onClose, children, wide, extraWide,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
  extraWide?: boolean
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
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
