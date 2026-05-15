'use client'

import { useState } from 'react'
import Link from 'next/link'
import { logout } from '@/lib/actions/auth'
import { ChevronDown, LogOut, User, Menu } from 'lucide-react'
import type { Profile } from '@/types'

interface HeaderProps {
  profile: Profile | null
  onMenuClick?: () => void
}

export function Header({ profile, onMenuClick }: HeaderProps) {
  const [open, setOpen] = useState(false)

  const initials = profile?.full_name
    ? profile.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
    : '?'

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 md:px-6 shrink-0">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 -ml-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Spacer on desktop */}
      <div className="hidden md:block" />

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition-colors"
        >
          <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xs font-semibold shrink-0">
            {initials}
          </div>
          <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[140px] truncate">
            {profile?.full_name ?? profile?.email ?? 'Usuário'}
          </span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 z-20 py-1 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-900 truncate">
                  {profile?.full_name ?? 'Usuário'}
                </p>
                <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
              </div>
              <Link
                href="/settings/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                <User className="w-4 h-4 text-gray-400" />
                Meu perfil
              </Link>
              <button
                onClick={() => { setOpen(false); logout() }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                <LogOut className="w-4 h-4 text-gray-400" />
                Sair
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
