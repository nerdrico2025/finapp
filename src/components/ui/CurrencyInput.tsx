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

// "123456" (cents as string) → "1.234,56"
function digitsToDisplay(digits: string): string {
  if (!digits) return ''
  const cents = parseInt(digits, 10)
  if (!cents) return ''
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

// "1234.56" (numeric) → "123456" (cents digits)
function numericToDigits(val: string | undefined): string {
  if (!val) return ''
  const num = parseFloat(val)
  if (!num) return ''
  return String(Math.round(num * 100))
}

export function CurrencyInput({
  value,
  onChange,
  onBlur,
  placeholder = '0,00',
  disabled,
  className,
}: CurrencyInputProps) {
  const [digits, setDigits] = useState(() => numericToDigits(value))

  // Sync when external value changes (e.g. form pre-fill on edit)
  useEffect(() => {
    setDigits(numericToDigits(value))
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Strip everything but digits, cap at 13 (= R$ 99.999.999.999,99)
    const newDigits = e.target.value.replace(/\D/g, '').slice(0, 13)
    setDigits(newDigits)
    onChange?.(newDigits ? String(parseInt(newDigits, 10) / 100) : '')
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={digitsToDisplay(digits)}
        onChange={handleChange}
        onBlur={onBlur}
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
