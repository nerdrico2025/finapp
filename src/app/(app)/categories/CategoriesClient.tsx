'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { createCategory, updateCategory, deleteCategory } from '@/lib/actions/categories'
import { CategoryForm, type CategoryFormValues } from '@/components/forms/CategoryForm'
import { cn } from '@/lib/utils/cn'
import type { Category } from '@/types'

interface Props {
  expenses: Category[]
  incomes: Category[]
  isBusinessEntity?: boolean
}

type ModalState =
  | { type: 'closed' }
  | { type: 'create'; categoryType: 'income' | 'expense'; parentId?: string }
  | { type: 'edit'; category: Category }
  | { type: 'delete'; category: Category }

export function CategoriesClient({ expenses: initialExpenses, incomes: initialIncomes, isBusinessEntity = false }: Props) {
  const [modal, setModal] = useState<ModalState>({ type: 'closed' })
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  function refresh() {
    router.refresh()
    setModal({ type: 'closed' })
  }

  async function handleCreate(data: CategoryFormValues) {
    const result = await createCategory(data)
    if (!result.error) { toast.success('Categoria criada!'); refresh() }
    return result
  }

  async function handleUpdate(data: CategoryFormValues) {
    if (modal.type !== 'edit') return { error: 'Erro interno' }
    const result = await updateCategory(modal.category.id, data)
    if (!result.error) { toast.success('Categoria atualizada!'); refresh() }
    return result
  }

  async function handleDelete() {
    if (modal.type !== 'delete') return
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteCategory(modal.category.id)
    setDeleting(false)
    if (result.error) {
      setDeleteError(result.error)
    } else {
      toast.success('Categoria excluída!')
      refresh()
    }
  }

  const modalTitle = modal.type === 'create'
    ? modal.parentId
      ? `Nova subcategoria de ${modal.categoryType === 'expense' ? 'despesa' : 'receita'}`
      : `Nova categoria de ${modal.categoryType === 'expense' ? 'despesa' : 'receita'}`
    : modal.type === 'edit'
      ? 'Editar categoria'
      : ''

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Categorias</h1>
          <p className="mt-0.5 text-sm text-gray-500">Organize suas transações por categorias</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CategoryList
            title="Despesas"
            icon={<TrendingDown className="w-4 h-4 text-red-500" />}
            accent="red"
            categories={initialExpenses}
            onAdd={() => setModal({ type: 'create', categoryType: 'expense' })}
            onAddSub={(parentId) => setModal({ type: 'create', categoryType: 'expense', parentId })}
            onEdit={(c) => setModal({ type: 'edit', category: c })}
            onDelete={(c) => { setDeleteError(null); setModal({ type: 'delete', category: c }) }}
          />

          <CategoryList
            title="Receitas"
            icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
            accent="green"
            categories={initialIncomes}
            onAdd={() => setModal({ type: 'create', categoryType: 'income' })}
            onAddSub={(parentId) => setModal({ type: 'create', categoryType: 'income', parentId })}
            onEdit={(c) => setModal({ type: 'edit', category: c })}
            onDelete={(c) => { setDeleteError(null); setModal({ type: 'delete', category: c }) }}
          />
        </div>
      </div>

      {(modal.type === 'create' || modal.type === 'edit') && (
        <Modal title={modalTitle} onClose={() => setModal({ type: 'closed' })}>
          <CategoryForm
            fixedType={modal.type === 'create' ? modal.categoryType : modal.category.type}
            defaultValues={modal.type === 'edit' ? modal.category : undefined}
            parentId={modal.type === 'create' ? (modal.parentId ?? null) : null}
            showDREGroup={isBusinessEntity}
            onSubmit={modal.type === 'create' ? handleCreate : handleUpdate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel={modal.type === 'create' ? 'Criar categoria' : 'Salvar alterações'}
          />
        </Modal>
      )}

      {modal.type === 'delete' && (
        <Modal title="Excluir categoria" onClose={() => setModal({ type: 'closed' })}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Tem certeza que deseja excluir a categoria{' '}
              <span className="font-semibold text-gray-900">
                {modal.category.icon} {modal.category.name}
              </span>
              ?
            </p>
            {deleteError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-700">{deleteError}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg"
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ─── Category List (with accordion) ───────────────────────────────────────────

function CategoryList({
  title,
  icon,
  accent,
  categories,
  onAdd,
  onAddSub,
  onEdit,
  onDelete,
}: {
  title: string
  icon: React.ReactNode
  accent: 'red' | 'green'
  categories: Category[]
  onAdd: () => void
  onAddSub: (parentId: string) => void
  onEdit: (c: Category) => void
  onDelete: (c: Category) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const total = categories.length

  return (
    <div className="bg-white rounded-2xl border border-gray-100">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{total}</span>
        </div>
        <button
          onClick={onAdd}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            accent === 'red'
              ? 'bg-red-50 text-red-700 hover:bg-red-100'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          )}
        >
          <Plus className="w-3.5 h-3.5" />
          Nova categoria
        </button>
      </div>

      {parents.length === 0 ? (
        <div className="py-10 text-center text-gray-400">
          <p className="text-sm">Nenhuma categoria ainda.</p>
          <button onClick={onAdd} className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
            Adicionar primeira
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {parents.map((parent) => {
            const children = childrenByParent.get(parent.id) ?? []
            const hasChildren = children.length > 0
            const isExpanded = expanded.has(parent.id)

            return (
              <li key={parent.id}>
                {/* Parent row */}
                <div className="flex items-center gap-3 px-5 py-3 group hover:bg-gray-50 transition-colors">
                  {/* Expand chevron */}
                  <button
                    type="button"
                    onClick={() => hasChildren && toggle(parent.id)}
                    className={cn(
                      'w-5 h-5 flex items-center justify-center shrink-0 rounded transition-colors',
                      hasChildren ? 'text-gray-400 hover:text-gray-600' : 'text-transparent cursor-default'
                    )}
                    aria-label={isExpanded ? 'Recolher' : 'Expandir'}
                  >
                    <ChevronRight
                      className={cn(
                        'w-3.5 h-3.5 transition-transform duration-150',
                        isExpanded && 'rotate-90'
                      )}
                    />
                  </button>

                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                    style={{ backgroundColor: parent.color ? `${parent.color}20` : '#f3f4f6' }}
                  >
                    {parent.icon ? (
                      <span>{parent.icon}</span>
                    ) : (
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: parent.color ?? '#64748b' }} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{parent.name}</p>
                    {(parent.is_default || parent.dre_group || hasChildren) && (
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {parent.is_default && <span className="text-xs text-gray-400">Padrão</span>}
                        {hasChildren && (
                          <span className="text-xs text-gray-400">{children.length} subcategoria{children.length !== 1 ? 's' : ''}</span>
                        )}
                        {parent.dre_group && (
                          <span className="text-[10px] font-medium bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 leading-none">DRE</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: parent.color ?? '#64748b' }} />

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(parent)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onAddSub(parent.id)}
                      className={cn(
                        'p-1.5 rounded-lg transition-colors',
                        accent === 'red'
                          ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
                          : 'text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50'
                      )}
                      title="Nova subcategoria"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    {!parent.is_default && (
                      <button
                        onClick={() => onDelete(parent)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Subcategories (accordion) */}
                {hasChildren && isExpanded && (
                  <ul className="border-t border-gray-50 bg-gray-50/30">
                    {children.map((child) => (
                      <li key={child.id} className="flex items-center gap-3 pl-11 pr-5 py-2.5 group/sub hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                        <div
                          className="w-6 h-6 rounded-md flex items-center justify-center text-sm shrink-0"
                          style={{ backgroundColor: child.color ? `${child.color}20` : '#f3f4f6' }}
                        >
                          {child.icon ? (
                            <span className="text-xs">{child.icon}</span>
                          ) : (
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: child.color ?? '#64748b' }} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">{child.name}</p>
                        </div>

                        <div className="flex gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEdit(child)}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {!child.is_default && (
                            <button
                              onClick={() => onDelete(child)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}

                    {/* Add sub button inside expanded parent */}
                    <li>
                      <button
                        onClick={() => onAddSub(parent.id)}
                        className={cn(
                          'w-full flex items-center gap-2 pl-11 pr-5 py-2 text-xs transition-colors',
                          accent === 'red'
                            ? 'text-red-500 hover:bg-red-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        )}
                      >
                        <Plus className="w-3 h-3" />
                        Nova subcategoria
                      </button>
                    </li>
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
