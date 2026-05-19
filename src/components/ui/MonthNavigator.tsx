import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

interface Props {
  month: number
  year: number
  basePath: string
}

export function MonthNavigator({ month, year, basePath }: Props) {
  const now = new Date()
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year

  return (
    <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-1 py-1">
      <Link
        href={`${basePath}?month=${prevMonth}&year=${prevYear}`}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Mês anterior"
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
          href={`${basePath}?month=${nextMonth}&year=${nextYear}`}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Próximo mês"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  )
}
