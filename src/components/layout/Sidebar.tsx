'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Tag,
  PieChart,
  Target,
  Bell,
  BarChart2,
  BarChart3,
  FileBarChart,
  Layers,
  Settings,
  TrendingUp,
  Users,
  X,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useEntityContext } from '@/contexts/EntityContext'
import { EntitySwitcher } from './EntitySwitcher'

// ─── Nav configs ──────────────────────────────────────────────────────────────

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>
  badge?: 'alerts'
}

const PF_NAV: NavItem[] = [
  { href: '/dashboard',       label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/transactions',    label: 'Transações',      icon: ArrowLeftRight },
  { href: '/accounts',        label: 'Contas',          icon: Wallet },
  { href: '/categories',      label: 'Categorias',      icon: Tag },
  { href: '/budgets',         label: 'Orçamentos',      icon: PieChart },
  { href: '/goals',           label: 'Metas',           icon: Target },
  { href: '/investments',     label: 'Investimentos',   icon: TrendingUp },
  { href: '/lista-de-sonhos', label: 'Lista de Sonhos', icon: Sparkles },
  { href: '/alerts',          label: 'Alertas',         icon: Bell, badge: 'alerts' },
  { href: '/reports',         label: 'Relatórios',      icon: BarChart2 },
]

const PJ_NAV: NavItem[] = [
  { href: '/dashboard',     label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/fluxo-de-caixa', label: 'Fluxo de Caixa', icon: BarChart3 },
  { href: '/dre',           label: 'DRE',             icon: FileBarChart },
  { href: '/transactions',  label: 'Transações',      icon: ArrowLeftRight },
  { href: '/accounts',      label: 'Contas',          icon: Wallet },
  { href: '/categories',    label: 'Categorias',      icon: Tag },
  { href: '/budgets',       label: 'Orçamentos',      icon: PieChart },
  { href: '/alerts',        label: 'Alertas',         icon: Bell, badge: 'alerts' },
  { href: '/consolidado',   label: 'Consolidado',     icon: Layers },
]

// ─── Active-state colours per context ─────────────────────────────────────────

const THEME = {
  pf: {
    navActive:   'bg-emerald-50 text-emerald-700',
    iconActive:  'text-emerald-600',
    linkDefault: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
    iconDefault: 'text-gray-400',
  },
  pj: {
    navActive:   'bg-blue-50 text-blue-700',
    iconActive:  'text-blue-600',
    linkDefault: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
    iconDefault: 'text-gray-400',
  },
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/transactions') return pathname === '/transactions'
  return pathname === href || pathname.startsWith(href + '/')
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  alertCount?: number
  isAdmin?: boolean
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ alertCount = 0, isAdmin = false, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { activeEntity, isLoading } = useEntityContext()

  const isBusinessEntity = !isLoading && activeEntity?.type === 'business'
  const navItems = isLoading ? [] : (isBusinessEntity ? PJ_NAV : PF_NAV)
  const theme = isBusinessEntity ? THEME.pj : THEME.pf

  return (
    <aside
      className={cn(
        'w-64 bg-white border-r border-gray-100 flex flex-col h-screen shrink-0',
        'fixed inset-y-0 left-0 z-30 transition-transform duration-300',
        'md:static md:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Logo row */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-gray-100 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-bold text-gray-900">FinApp</span>
        </Link>
        <button
          onClick={onClose}
          className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Entity switcher */}
      <div className="pt-3">
        <EntitySwitcher />
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active ? theme.navActive : theme.linkDefault
              )}
            >
              <Icon
                className={cn('w-4.5 h-4.5 shrink-0', active ? theme.iconActive : theme.iconDefault)}
                strokeWidth={active ? 2.5 : 2}
              />
              <span className="flex-1">{label}</span>
              {badge === 'alerts' && alertCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-amber-500 text-white text-[10px] font-bold rounded-full">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 pb-4 border-t border-gray-100 pt-3 space-y-0.5 shrink-0">
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith('/admin')
                ? 'bg-emerald-50 text-emerald-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <Users
              className={cn('w-4.5 h-4.5 shrink-0', pathname.startsWith('/admin') ? 'text-emerald-600' : 'text-gray-400')}
              strokeWidth={pathname.startsWith('/admin') ? 2.5 : 2}
            />
            Usuários
          </Link>
        )}
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-emerald-50 text-emerald-700'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          )}
        >
          <Settings
            className={cn(
              'w-4.5 h-4.5 shrink-0',
              pathname.startsWith('/settings') ? 'text-emerald-600' : 'text-gray-400'
            )}
            strokeWidth={pathname.startsWith('/settings') ? 2.5 : 2}
          />
          Configurações
        </Link>
      </div>
    </aside>
  )
}
