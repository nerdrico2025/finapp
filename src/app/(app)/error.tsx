'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Algo deu errado</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">
        Ocorreu um erro inesperado ao carregar esta página.
        {error.digest && (
          <span className="block mt-1 text-xs text-gray-400 font-mono">
            ID: {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Tentar novamente
      </button>
    </div>
  )
}
