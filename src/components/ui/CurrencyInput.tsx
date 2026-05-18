'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils/cn'

interface CurrencyInputProps {
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

function numericToDisplay(val: string | undefined): string {
  if (!val) return ''
  const num = parseFloat(val)
  if (isNaN(num) || num === 0) return ''
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function displayToNumeric(display: string): string {
  if (!display) return ''
  const cleaned = display.replace(/\./g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? '' : String(num)
}

export function CurrencyInput({
  value,
  onChange,
  onBlur,
  placeholder = '0,00',
  disabled,
  className,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => numericToDisplay(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      setDisplay(numericToDisplay(value))
    }
  }, [value, focused])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const sanitized = e.target.value.replace(/[^\d,.]/g, '')
    setDisplay(sanitized)
    onChange?.(displayToNumeric(sanitized))
  }

  function handleBlur() {
    setFocused(false)
    const numeric = displayToNumeric(display)
    if (numeric) setDisplay(numericToDisplay(numeric))
    onBlur?.()
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
        R$
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent',
          className
        )}
      />
    </div>
  )
}
