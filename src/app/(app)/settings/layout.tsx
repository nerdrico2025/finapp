'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, Lock, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const settingsNav = [
  { href: '/settings/profile',     label: 'Perfil',       icon: User },
  { href: '/settings/security',    label: 'Segurança',    icon: Lock },
  { href: '/settings/preferences', label: 'Preferências', icon: SlidersHorizontal },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Configurações</h1>
        <p className="mt-0.5 text-sm text-gray-500">Gerencie sua conta e preferências</p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Side nav */}
        <nav className="w-44 shrink-0 bg-white rounded-2xl border border-gray-100 p-2">
          {settingsNav.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon
                  className={cn('w-4 h-4 shrink-0', isActive ? 'text-emerald-600' : 'text-gray-400')}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}
