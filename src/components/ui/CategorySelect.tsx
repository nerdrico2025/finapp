'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown, Check, Search, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { computeMenuPosition, type MenuPosition } from '@/lib/ui/menu-position'
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
  /**
   * Habilita "Nova categoria" no rodapé do menu. O formulário abre dentro do
   * próprio menu (nome pré-preenchido com a busca); devolva true quando a
   * categoria foi criada (o menu fecha) e false para manter o formulário
   * aberto (erro já avisado pelo chamador).
   */
  onCreate?: (input: { name: string; color: string }) => Promise<boolean>
  createNewLabel?: string
  /** Tipo da categoria criada — só para o rótulo do formulário. */
  createType?: 'income' | 'expense'
}

export const NEW_CATEGORY_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#6b7280', '#9ca3af'] as const

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

// Largura mínima do menu aberto, independente da largura do trigger que o
// abre — calibrada para acomodar os labels mais longos do conjunto padrão de
// categorias (ex. "Restaurantes e lanchonetes") em até 2 linhas legíveis.
const MIN_MENU_WIDTH = 240

export function CategorySelect({
  categories,
  value,
  onChange,
  placeholder = 'Selecione uma categoria',
  className,
  allowEmpty = true,
  selectableParents = false,
  compact = false,
  onCreate,
  createNewLabel = '+ Nova categoria',
  createType,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<MenuPosition | null>(null)
  /** Formulário de nova categoria aberto dentro do menu. */
  const [creating, setCreating] = useState<{ name: string; color: string; saving: boolean } | null>(null)
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
  const hasFooter = !!onCreate && !creating
  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    // O menu nunca fica mais estreito que MIN_MENU_WIDTH (em contextos
    // compactos o trigger tem só ~100px); busca e rodapé sempre cabem na tela
    // (ver computeMenuPosition).
    setPos(computeMenuPosition(
      el.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight },
      { minWidth: MIN_MENU_WIDTH, hasFooter },
    ))
  }, [hasFooter])

  useEffect(() => {
    if (!open) return
    updatePosition()
    function onScroll() { updatePosition() }
    function onClick(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
      setCreating(null)
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    document.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open, updatePosition])

  // Foco na busca só ao abrir (não ao trocar lista ↔ formulário).
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => searchRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  function toggle() {
    setOpen((o) => {
      const next = !o
      if (next) setQuery('')
      return next
    })
    setCreating(null)
  }

  async function saveNew() {
    if (!onCreate || !creating || creating.saving) return
    setCreating((c) => (c ? { ...c, saving: true } : c))
    let ok = false
    try {
      ok = await onCreate({ name: creating.name.trim(), color: creating.color })
    } catch {
      ok = false
    }
    if (ok) {
      setCreating(null)
      setOpen(false)
    } else {
      setCreating((c) => (c ? { ...c, saving: false } : c))
    }
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
                disabled={!!creating}
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
            {creating ? (
              <div className="p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600">
                  {createType === 'income' ? 'Nova categoria de receita' : createType === 'expense' ? 'Nova categoria de despesa' : 'Nova categoria'}
                </p>
                <input
                  autoFocus
                  placeholder="Nome da categoria"
                  value={creating.name}
                  disabled={creating.saving}
                  onChange={(e) => setCreating((c) => (c ? { ...c, name: e.target.value } : c))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveNew() }
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCreating(null); setTimeout(() => searchRef.current?.focus(), 0) }
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <div className="flex gap-1.5">
                  {NEW_CATEGORY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Cor ${color}`}
                      onClick={() => setCreating((c) => (c ? { ...c, color } : c))}
                      className={cn('w-5 h-5 rounded-full transition-transform', creating.color === color && 'ring-2 ring-offset-1 ring-gray-400 scale-110')}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setCreating(null); setTimeout(() => searchRef.current?.focus(), 0) }}
                    className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg bg-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={saveNew}
                    disabled={creating.saving}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 rounded-lg"
                  >
                    {creating.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Salvar
                  </button>
                </div>
              </div>
            ) : (<>
            {showEmpty && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 flex items-center justify-between gap-2',
                  !value && 'bg-gray-50 text-gray-700 font-medium'
                )}
              >
                <span className="break-words">Sem categoria</span>
                {!value && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
              </button>
            )}

            {filtered.map(({ parent, children }) => {
              const hasChildren = (childrenByParent.get(parent.id) ?? []).length > 0
              const isHeader = hasChildren && !selectableParents

              return (
                <div key={parent.id}>
                  {isHeader ? (
                    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 first:pt-1 min-w-0">
                      {parent.icon && <span className="text-sm shrink-0">{parent.icon}</span>}
                      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide leading-snug break-words">
                        {parent.name}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => select(parent.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between gap-2',
                        value === parent.id && 'bg-emerald-50 text-emerald-700'
                      )}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        {parent.icon && <span className="shrink-0">{parent.icon}</span>}
                        <span className={cn('break-words', selectableParents && hasChildren && 'font-medium text-gray-600')}>
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
                        'w-full text-left pl-7 pr-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between gap-2',
                        value === child.id && 'bg-emerald-50 text-emerald-700'
                      )}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        {child.icon && <span className="shrink-0">{child.icon}</span>}
                        <span className="break-words">{child.name}</span>
                      </span>
                      {value === child.id && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              )
            })}

            {filtered.length === 0 && !showEmpty && (
              <p className="px-3 py-4 text-sm text-gray-500 text-center">Nenhuma categoria encontrada</p>
            )}
            </>)}
          </div>

          {hasFooter && (
            <button
              type="button"
              onClick={() => setCreating({ name: query.trim(), color: '#6b7280', saving: false })}
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
