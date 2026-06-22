'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown, Check, Search, Plus } from 'lucide-react'
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
  /** Compact trigger for dense contexts like the import table rows. */
  compact?: boolean
  /** Optional "create new" action shown at the bottom of the list. */
  onCreateNew?: () => void
  createNewLabel?: string
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

function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

interface MenuPos {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
}

export function CategorySelect({
  categories,
  value,
  onChange,
  placeholder = 'Selecione uma categoria',
  className,
  allowEmpty = true,
  selectableParents = false,
  compact = false,
  onCreateNew,
  createNewLabel = '+ Nova categoria',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<MenuPos | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { parents, childrenByParent } = buildCategoryTree(categories)
  const selectedCat = categories.find((c) => c.id === value) ?? null

  // ── Filtered tree ──────────────────────────────────────────────────────────
  const q = normalize(query)
  const filtered = useMemo(() => {
    return parents
      .map((parent) => {
        const children = childrenByParent.get(parent.id) ?? []
        const parentMatches = !q || normalize(parent.name).includes(q)
        const matchingChildren = q
          ? children.filter((c) => normalize(c.name).includes(q))
          : children
        const visibleChildren = parentMatches ? children : matchingChildren
        const show = !q || parentMatches || matchingChildren.length > 0
        return { parent, children: visibleChildren, parentMatches, show }
      })
      .filter((g) => g.show)
  }, [parents, childrenByParent, q])

  // Flat list of selectable ids in display order — for keyboard Enter.
  const firstSelectableId = useMemo(() => {
    for (const g of filtered) {
      const hasChildren = (childrenByParent.get(g.parent.id) ?? []).length > 0
      const isHeader = hasChildren && !selectableParents
      if (!isHeader) return g.parent.id
      if (g.children.length > 0) return g.children[0].id
    }
    return null
  }, [filtered, childrenByParent, selectableParents])

  // ── Positioning (fixed, so it escapes parent overflow like the import table) ─
  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    const openUp = spaceBelow < 280 && spaceAbove > spaceBelow
    const maxHeight = Math.min(320, (openUp ? spaceAbove : spaceBelow) - 12)
    setPos({
      ...(openUp
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
      left: r.left,
      width: r.width,
      maxHeight,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    const t = setTimeout(() => searchRef.current?.focus(), 0)
    function onScroll() { updatePosition() }
    function onClick(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    document.addEventListener('mousedown', onClick)
    return () => {
      clearTimeout(t)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open, updatePosition])

  function toggle() {
    setOpen((o) => {
      const next = !o
      if (next) setQuery('')
      return next
    })
  }

  function select(id: string) {
    onChange(id)
    setOpen(false)
  }

  const showEmpty = allowEmpty && (!q || 'sem categoria'.includes(q))

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={cn(
          'w-full rounded-lg bg-white flex items-center justify-between gap-2 text-left',
          compact
            ? 'px-2 py-1 text-xs border border-transparent hover:border-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-400'
            : 'px-3 py-2.5 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent'
        )}
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

      {open && pos && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            width: pos.width,
          }}
          className="z-[70] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
        >
          {/* Search box */}
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (firstSelectableId) select(firstSelectableId)
                  }
                }}
                placeholder="Buscar categoria..."
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: pos.maxHeight }}>
            {showEmpty && (
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

            {filtered.map(({ parent, children }) => {
              const hasChildren = (childrenByParent.get(parent.id) ?? []).length > 0
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

            {filtered.length === 0 && !showEmpty && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">Nenhuma categoria encontrada</p>
            )}
          </div>

          {onCreateNew && (
            <button
              type="button"
              onClick={() => { onCreateNew(); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 text-sm text-emerald-600 hover:bg-emerald-50 flex items-center gap-1.5 border-t border-gray-100 font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              {createNewLabel.replace(/^\+\s*/, '')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
