import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'DRE — Demonstrativo de Resultado' }

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, Building2, FileBarChart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getActiveEntityId } from '@/lib/entity'
import { getDRE } from '@/lib/actions/dre'
import { DREClient } from './DREClient'
import { UpgradeGate } from '@/components/ui/UpgradeGate'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default async function DREPage({
  searchParams,
}: {
  searchParams: { type?: string; month?: string; year?: string }
}) {
  // ── Auth & entity gate ────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const entityId = await getActiveEntityId(supabase, user.id)
  if (!entityId) redirect('/dashboard')

  const { data: entity } = await supabase
    .from('entities')
    .select('*')
    .eq('id', entityId)
    .single()

  if (!entity || entity.type !== 'business') redirect('/dashboard')

  // ── Period params ─────────────────────────────────────────────────────────
  const now = new Date()
  const periodType = searchParams.type === 'year' ? 'year' : 'month'

  let month = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1
  let year  = searchParams.year  ? parseInt(searchParams.year)  : now.getFullYear()

  if (isNaN(month) || month < 1 || month > 12) month = now.getMonth() + 1
  if (isNaN(year)  || year < 2000 || year > now.getFullYear() + 1) year = now.getFullYear()

  // ── Data ──────────────────────────────────────────────────────────────────
  const data = await getDRE(entityId!, periodType, month, year)

  // ── Period navigation URLs ────────────────────────────────────────────────
  const base = '/dre'

  // Month nav
  const prevM = month === 1 ? 12 : month - 1
  const prevMY = month === 1 ? year - 1 : year
  const nextM = month === 12 ? 1 : month + 1
  const nextMY = month === 12 ? year + 1 : year
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  // Year nav
  const isCurrentYear = year === now.getFullYear()

  return (
    <UpgradeGate feature="canAccessPJ">
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <FileBarChart className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">DRE</h1>
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
              <Building2 className="w-3 h-3" />
              {entity.name}
            </span>
          </div>
          <p className="text-sm text-gray-400">Demonstrativo de Resultado do Exercício</p>
        </div>

        {/* ── Period controls ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Type toggle */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
            <Link
              href={`${base}?type=month&month=${month}&year=${year}`}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                periodType === 'month'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Mês
            </Link>
            <Link
              href={`${base}?type=year&year=${year}`}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                periodType === 'year'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Ano
            </Link>
          </div>

          {/* Month navigator */}
          {periodType === 'month' && (
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-1 py-1">
              <Link
                href={`${base}?type=month&month=${prevM}&year=${prevMY}`}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </Link>
              <span className="min-w-[136px] text-center text-sm font-semibold text-gray-800">
                {MONTHS[month - 1]} {year}
              </span>
              {isCurrentMonth ? (
                <span className="p-1.5 text-gray-200 cursor-not-allowed">
                  <ChevronRight className="w-4 h-4" />
                </span>
              ) : (
                <Link
                  href={`${base}?type=month&month=${nextM}&year=${nextMY}`}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          )}

          {/* Year navigator */}
          {periodType === 'year' && (
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-1 py-1">
              <Link
                href={`${base}?type=year&year=${year - 1}`}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </Link>
              <span className="min-w-[64px] text-center text-sm font-semibold text-gray-800">
                {year}
              </span>
              {isCurrentYear ? (
                <span className="p-1.5 text-gray-200 cursor-not-allowed">
                  <ChevronRight className="w-4 h-4" />
                </span>
              ) : (
                <Link
                  href={`${base}?type=year&year=${year + 1}`}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <DRESummaryCards data={data} />

      {/* ── DRE Table ─────────────────────────────────────────────────────── */}
      <DREClient data={data} />
    </div>
    </UpgradeGate>
  )
}

// ─── Summary Cards ─────────────────────────────────────────────────────────────

function DRESummaryCards({ data }: { data: Awaited<ReturnType<typeof getDRE>> }) {
  const rb = data.receita_bruta.total
  const ded = data.deducoes.total
  const cmv = data.cmv.total
  const opex = data.despesa_operacional.total
  const dep = data.depreciacao.total

  const receitaLiquida = rb - ded
  const ebitda = receitaLiquida - cmv - opex
  const resultado = ebitda - dep

  const ebitdaMargin = rb > 0 ? (ebitda / rb) * 100 : null
  const resultMargin = rb > 0 ? (resultado / rb) * 100 : null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard
        label="Receita Bruta"
        value={rb}
        color="blue"
      />
      <SummaryCard
        label="Receita Líquida"
        value={receitaLiquida}
        color={receitaLiquida >= 0 ? 'emerald' : 'red'}
      />
      <SummaryCard
        label="EBITDA"
        value={ebitda}
        color={ebitda >= 0 ? 'emerald' : 'red'}
        sub={ebitdaMargin !== null ? `Margem ${ebitdaMargin.toFixed(1)}%` : undefined}
      />
      <SummaryCard
        label="Resultado Líquido"
        value={resultado}
        color={resultado >= 0 ? 'emerald' : 'red'}
        sub={resultMargin !== null ? `Margem ${resultMargin.toFixed(1)}%` : undefined}
        highlight
      />
    </div>
  )
}

function SummaryCard({
  label, value, color, sub, highlight,
}: {
  label: string
  value: number
  color: 'blue' | 'emerald' | 'red'
  sub?: string
  highlight?: boolean
}) {
  const colors = {
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: '' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: '' },
    red:     { bg: 'bg-red-50',     text: 'text-red-700',     border: '' },
  }
  const c = colors[color]

  return (
    <div className={cn(
      'rounded-2xl border px-5 py-4',
      highlight ? `${c.bg} border-current/10` : 'bg-white border-gray-100'
    )}>
      <p className="text-xs text-gray-500 font-medium mb-2">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums leading-tight', c.text)}>
        {formatCurrency(value)}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
