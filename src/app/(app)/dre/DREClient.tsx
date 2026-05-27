'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Info } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/format'
import type { DREResult, DREGroup, DRECategoryItem } from '@/lib/actions/dre'

interface Props {
  data: DREResult
}

// ─── Calculation helpers ──────────────────────────────────────────────────────

function pct(value: number, base: number) {
  if (!base) return null
  return (value / base) * 100
}

function delta(curr: number, prev: number) {
  if (!prev) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

function fmtPct(v: number | null) {
  if (v === null) return '—'
  return `${v >= 0 ? '' : ''}${v.toFixed(1)}%`
}

function fmtDelta(v: number | null) {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DREClient({ data }: Props) {
  const [expandedOpex, setExpandedOpex] = useState(false)
  const [expandedOther, setExpandedOther] = useState<Record<string, boolean>>({})

  const rb = data.receita_bruta.total
  const prevRb = data.receita_bruta.prevTotal

  const receitaLiquida = rb - data.deducoes.total
  const prevReceitaLiquida = prevRb - data.deducoes.prevTotal

  const lucroBruto = receitaLiquida - data.cmv.total
  const prevLucroBruto = prevReceitaLiquida - data.cmv.prevTotal

  const ebitda = lucroBruto - data.despesa_operacional.total
  const prevEbitda = prevLucroBruto - data.despesa_operacional.prevTotal

  const resultado = ebitda - data.depreciacao.total
  const prevResultado = prevEbitda - data.depreciacao.prevTotal

  const toggle = (key: string) => setExpandedOther((p: Record<string, boolean>) => ({ ...p, [key]: !p[key] }))

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 bg-gray-50 border-b border-gray-100 px-5 py-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Linha</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right w-28 hidden sm:block">
          {data.periodLabel}
        </span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right w-16 hidden lg:block">% Rec.</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right w-28 hidden sm:block">
          {data.prevLabel}
        </span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right w-20 hidden md:block">Var.</span>
      </div>

      <div className="divide-y divide-gray-50">
        {/* (+) Receita Bruta */}
        <DRELine
          sign="+"
          label="Receita Bruta"
          value={rb}
          prevValue={prevRb}
          base={rb}
          accentColor="emerald"
          expandable={data.receita_bruta.items.length > 0}
          expanded={!!expandedOther['rb']}
          onToggle={() => toggle('rb')}
        />
        {expandedOther['rb'] && (
          <SubItems items={data.receita_bruta.items} base={rb} />
        )}

        {/* (-) Deduções */}
        <DRELine
          sign="−"
          label="Deduções / Impostos sobre Receita"
          value={data.deducoes.total}
          prevValue={data.deducoes.prevTotal}
          base={rb}
          accentColor="red"
          expandable={data.deducoes.items.length > 0}
          expanded={!!expandedOther['ded']}
          onToggle={() => toggle('ded')}
        />
        {expandedOther['ded'] && (
          <SubItems items={data.deducoes.items} base={rb} />
        )}

        {/* (=) Receita Líquida */}
        <SubtotalLine
          label="Receita Líquida"
          value={receitaLiquida}
          prevValue={prevReceitaLiquida}
          base={rb}
          prevBase={prevRb}
        />

        {/* (-) CMV */}
        <DRELine
          sign="−"
          label="CMV / Custos dos Serviços Prestados"
          value={data.cmv.total}
          prevValue={data.cmv.prevTotal}
          base={rb}
          accentColor="red"
          expandable={data.cmv.items.length > 0}
          expanded={!!expandedOther['cmv']}
          onToggle={() => toggle('cmv')}
        />
        {expandedOther['cmv'] && (
          <SubItems items={data.cmv.items} base={rb} />
        )}

        {/* (=) Lucro Bruto */}
        <SubtotalLine
          label="Lucro Bruto"
          value={lucroBruto}
          prevValue={prevLucroBruto}
          base={rb}
          prevBase={prevRb}
        />

        {/* (-) Despesas Operacionais */}
        <DRELine
          sign="−"
          label="Despesas Operacionais"
          value={data.despesa_operacional.total}
          prevValue={data.despesa_operacional.prevTotal}
          base={rb}
          accentColor="red"
          expandable={data.despesa_operacional.items.length > 0}
          expanded={expandedOpex}
          onToggle={() => setExpandedOpex((v: boolean) => !v)}
        />
        {expandedOpex && (
          <SubItems items={data.despesa_operacional.items} base={rb} />
        )}

        {/* (=) EBITDA */}
        <SubtotalLine
          label="EBITDA"
          value={ebitda}
          prevValue={prevEbitda}
          base={rb}
          prevBase={prevRb}
        />

        {/* (-) Depreciação */}
        <DRELine
          sign="−"
          label="Depreciação / Amortização"
          value={data.depreciacao.total}
          prevValue={data.depreciacao.prevTotal}
          base={rb}
          accentColor="red"
          expandable={data.depreciacao.items.length > 0}
          expanded={!!expandedOther['dep']}
          onToggle={() => toggle('dep')}
        />
        {expandedOther['dep'] && (
          <SubItems items={data.depreciacao.items} base={rb} />
        )}

        {/* (=) Resultado Líquido */}
        <ResultLine
          value={resultado}
          prevValue={prevResultado}
          base={rb}
          prevBase={prevRb}
        />
      </div>

      {rb === 0 && (
        <div className="flex items-center gap-2 px-5 py-4 bg-amber-50 border-t border-amber-100">
          <Info className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700">
            Nenhuma receita mapeada no DRE neste período. Configure o grupo DRE nas categorias para ver o demonstrativo.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── DRE Line ─────────────────────────────────────────────────────────────────

function DRELine({
  sign, label, value, prevValue, base, accentColor, expandable, expanded, onToggle,
}: {
  sign: '+' | '−'
  label: string
  value: number
  prevValue: number
  base: number
  accentColor: 'emerald' | 'red'
  expandable: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const d = delta(value, prevValue)

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-5 py-3 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={cn(
          'text-sm font-bold w-4 shrink-0',
          accentColor === 'emerald' ? 'text-emerald-600' : 'text-red-500'
        )}>{sign}</span>
        <span className="text-sm text-gray-700 truncate">{label}</span>
        {expandable && (
          <button
            onClick={onToggle}
            className="shrink-0 p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      <span className="text-sm font-semibold text-gray-900 tabular-nums text-right w-28 hidden sm:block">
        {formatCurrency(value)}
      </span>
      <span className="text-xs text-gray-400 tabular-nums text-right w-16 hidden lg:block">
        {fmtPct(pct(value, base))}
      </span>
      <span className="text-sm text-gray-400 tabular-nums text-right w-28 hidden sm:block">
        {formatCurrency(prevValue)}
      </span>
      <span className={cn(
        'text-xs tabular-nums font-medium text-right w-20 hidden md:block',
        d === null ? 'text-gray-300' : d >= 0 ? 'text-emerald-600' : 'text-red-600'
      )}>
        {fmtDelta(d)}
      </span>
    </div>
  )
}

// ─── Subtotal Line ────────────────────────────────────────────────────────────

function SubtotalLine({
  label, value, prevValue, base, prevBase,
}: {
  label: string
  value: number
  prevValue: number
  base: number
  prevBase: number
}) {
  const d = delta(value, prevValue)

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-5 py-3 bg-gray-50">
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-bold text-gray-400 w-4 shrink-0">=</span>
        <span className="text-sm font-semibold text-gray-900">{label}</span>
      </div>
      <span className={cn(
        'text-sm font-bold tabular-nums text-right w-28 hidden sm:block',
        value >= 0 ? 'text-emerald-700' : 'text-red-700'
      )}>
        {formatCurrency(value)}
      </span>
      <span className="text-xs text-gray-400 tabular-nums text-right w-16 hidden lg:block">
        {fmtPct(pct(value, base))}
      </span>
      <span className="text-sm text-gray-400 tabular-nums text-right w-28 hidden sm:block">
        {formatCurrency(prevValue)}
      </span>
      <span className={cn(
        'text-xs tabular-nums font-medium text-right w-20 hidden md:block',
        d === null ? 'text-gray-300' : d >= 0 ? 'text-emerald-600' : 'text-red-600'
      )}>
        {fmtDelta(d)}
      </span>
    </div>
  )
}

// ─── Result Line ──────────────────────────────────────────────────────────────

function ResultLine({
  value, prevValue, base, prevBase,
}: {
  value: number
  prevValue: number
  base: number
  prevBase: number
}) {
  const d = delta(value, prevValue)
  const isPositive = value >= 0

  return (
    <div className={cn(
      'grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-5 py-4 border-t-2',
      isPositive
        ? 'bg-emerald-50 border-emerald-200'
        : 'bg-red-50 border-red-200'
    )}>
      <div className="flex items-center gap-2.5">
        <span className={cn('text-sm font-bold w-4 shrink-0', isPositive ? 'text-emerald-600' : 'text-red-600')}>=</span>
        <div>
          <p className="text-sm font-bold text-gray-900">Resultado Líquido</p>
          <p className="text-xs text-gray-500 hidden sm:block">Lucro / Prejuízo do período</p>
        </div>
      </div>
      <span className={cn(
        'text-base font-bold tabular-nums text-right w-28 hidden sm:block',
        isPositive ? 'text-emerald-700' : 'text-red-700'
      )}>
        {isPositive ? '' : ''}{formatCurrency(value)}
      </span>
      <span className="text-xs text-gray-400 tabular-nums text-right w-16 hidden lg:block">
        {fmtPct(pct(value, base))}
      </span>
      <span className="text-sm text-gray-400 tabular-nums text-right w-28 hidden sm:block">
        {formatCurrency(prevValue)}
      </span>
      <span className={cn(
        'text-sm tabular-nums font-bold text-right w-20 hidden md:block',
        d === null ? 'text-gray-300' : d >= 0 ? 'text-emerald-700' : 'text-red-700'
      )}>
        {fmtDelta(d)}
      </span>
    </div>
  )
}

// ─── Sub-items ────────────────────────────────────────────────────────────────

function SubItems({ items, base }: { items: DRECategoryItem[]; base: number }) {
  return (
    <>
      {items.map((item) => {
        const d = delta(item.value, item.prevValue)
        return (
          <div
            key={item.categoryId}
            className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center pl-10 pr-5 py-2 bg-gray-50/40 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              {item.icon ? (
                <span className="text-sm shrink-0">{item.icon}</span>
              ) : (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.color ?? '#94a3b8' }}
                />
              )}
              <span className="text-xs text-gray-600 truncate">{item.name}</span>
            </div>
            <span className="text-xs font-medium text-gray-700 tabular-nums text-right w-28 hidden sm:block">
              {formatCurrency(item.value)}
            </span>
            <span className="text-xs text-gray-400 tabular-nums text-right w-16 hidden lg:block">
              {fmtPct(pct(item.value, base))}
            </span>
            <span className="text-xs text-gray-400 tabular-nums text-right w-28 hidden sm:block">
              {formatCurrency(item.prevValue)}
            </span>
            <span className={cn(
              'text-xs tabular-nums text-right w-20 hidden md:block',
              d === null ? 'text-gray-300' : d >= 0 ? 'text-emerald-600' : 'text-red-600'
            )}>
              {fmtDelta(d)}
            </span>
          </div>
        )
      })}
    </>
  )
}
