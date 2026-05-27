import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Consolidado — Visão Geral PF + PJ' }

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getConsolidado } from '@/lib/actions/consolidado'
import { ConsolidadoClient } from './ConsolidadoClient'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default async function ConsolidadoPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Gate: needs at least one business entity
  const { data: entities } = await supabase
    .from('entities')
    .select('id, type')
    .eq('owner_id', user.id)

  if (!entities?.some(e => e.type === 'business')) redirect('/dashboard')

  const now = new Date()
  let month = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1
  let year  = searchParams.year  ? parseInt(searchParams.year)  : now.getFullYear()

  if (isNaN(month) || month < 1 || month > 12) month = now.getMonth() + 1
  if (isNaN(year)  || year < 2000 || year > now.getFullYear() + 1) year = now.getFullYear()

  const data = await getConsolidado(month, year)

  const prevM  = month === 1 ? 12 : month - 1
  const prevMY = month === 1 ? year - 1 : year
  const nextM  = month === 12 ? 1 : month + 1
  const nextMY = month === 12 ? year + 1 : year
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Layers className="w-5 h-5 text-violet-600" />
            <h1 className="text-2xl font-semibold text-gray-900">Consolidado</h1>
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5">
              Todas as entidades
            </span>
          </div>
          <p className="text-sm text-gray-400">Visão consolidada PF + PJ</p>
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-1 py-1">
          <Link
            href={`/consolidado?month=${prevM}&year=${prevMY}`}
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
              href={`/consolidado?month=${nextM}&year=${nextMY}`}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      <ConsolidadoClient data={data} month={month} year={year} />
    </div>
  )
}
