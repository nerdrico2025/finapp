'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TrendingUp, Menu, X } from 'lucide-react'

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 bg-white transition-shadow duration-200 ${
        scrolled ? 'shadow-md' : 'shadow-none'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <TrendingUp className="h-5 w-5 text-indigo-600" />
            <span className="text-lg font-bold text-gray-900">FinApp</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <a
              href="#funcionalidades"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Funcionalidades
            </a>
            <a
              href="#planos"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Planos
            </a>
            <a
              href="#faq"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              FAQ
            </a>
          </nav>

          {/* Desktop buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors"
            >
              Começar grátis
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden border-t border-gray-100 py-4 flex flex-col gap-4 pb-5">
            <a
              href="#funcionalidades"
              className="text-sm text-gray-700 px-1 py-1"
              onClick={() => setOpen(false)}
            >
              Funcionalidades
            </a>
            <a
              href="#planos"
              className="text-sm text-gray-700 px-1 py-1"
              onClick={() => setOpen(false)}
            >
              Planos
            </a>
            <a
              href="#faq"
              className="text-sm text-gray-700 px-1 py-1"
              onClick={() => setOpen(false)}
            >
              FAQ
            </a>
            <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
              <Link
                href="/login"
                className="text-center text-sm font-medium text-gray-700 border border-gray-300 px-4 py-2.5 rounded-xl"
              >
                Entrar
              </Link>
              <Link
                href="/signup"
                className="text-center text-sm font-medium text-white bg-indigo-600 px-4 py-2.5 rounded-xl"
              >
                Começar grátis
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
