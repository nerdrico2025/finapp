'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Category } from '@/types'

interface Props {
  categories: Category[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  allowEmpty?: boolean
  selectableParents?: boolean
}

export function buildCategoryTree(categories: Category[]) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const parents = categories.filter((c) => !c.parent_id || !byId.has(c.parent_id))
  const childrenByParent = new Map<string, Category[]>()
  for (const cat of categories) {
    if (cat.parent_id && byId.has(cat.parent_id)) {
      const list = childrenByParent.get(cat.parent_id) ?? []
      list.push(cat)
      childrenByParent.set(cat.parent_id, list)
    }
  }
  return { parents, childrenByParent }
}

export function CategorySelect({
  categories,
  value,
  onChange,
  placeholder = 'Selecione uma categoria',
  className,
  allowEmpty = true,
  selectableParents = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { parents, childrenByParent } = buildCategoryTree(categories)
  const selectedCat = categories.find((c) => c.id === value) ?? null

  function select(id: string) {
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent flex items-center justify-between gap-2 text-left"
      >
        <span className={cn('flex items-center gap-1.5 flex-1 min-w-0', !selectedCat && 'text-gray-400')}>
          {selectedCat ? (
            <>
              {selectedCat.icon && <span className="shrink-0">{selectedCat.icon}</span>}
              <span className="truncate">{selectedCat.name}</span>
            </>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 shrink-0 transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 flex items-center justify-between',
                  !value && 'bg-gray-50 text-gray-500 font-medium'
                )}
              >
                <span>Sem categoria</span>
                {!value && <Check className="w-3.5 h-3.5 text-emerald-500" />}
              </button>
            )}

            {parents.map((parent) => {
              const children = childrenByParent.get(parent.id) ?? []
              const hasChildren = children.length > 0
              const isHeader = hasChildren && !selectableParents

              return (
                <div key={parent.id}>
                  {isHeader ? (
                    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 first:pt-1">
                      {parent.icon && <span className="text-sm">{parent.icon}</span>}
                      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide leading-none">
                        {parent.name}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => select(parent.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between',
                        value === parent.id && 'bg-emerald-50 text-emerald-700'
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {parent.icon && <span>{parent.icon}</span>}
                        <span className={cn(selectableParents && hasChildren && 'font-medium text-gray-600')}>
                          {parent.name}
                        </span>
                      </span>
                      {value === parent.id && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    </button>
                  )}

                  {children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => select(child.id)}
                      className={cn(
                        'w-full text-left pl-7 pr-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between',
                        value === child.id && 'bg-emerald-50 text-emerald-700'
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {child.icon && <span>{child.icon}</span>}
                        <span>{child.name}</span>
                      </span>
                      {value === child.id && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
