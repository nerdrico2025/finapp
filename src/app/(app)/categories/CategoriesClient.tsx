'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'
import { createCategory, updateCategory, deleteCategory } from '@/lib/actions/categories'
import { CategoryForm, type CategoryFormValues } from '@/components/forms/CategoryForm'
import { cn } from '@/lib/utils/cn'
import type { Category } from '@/types'

interface Props {
  expenses: Category[]
  incomes: Category[]
}

type ModalState =
  | { type: 'closed' }
  | { type: 'create'; categoryType: 'income' | 'expense' }
  | { type: 'edit'; category: Category }
  | { type: 'delete'; category: Category }

export function CategoriesClient({ expenses: initialExpenses, incomes: initialIncomes }: Props) {
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
            onEdit={(c) => setModal({ type: 'edit', category: c })}
            onDelete={(c) => { setDeleteError(null); setModal({ type: 'delete', category: c }) }}
          />

          <CategoryList
            title="Receitas"
            icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
            accent="green"
            categories={initialIncomes}
            onAdd={() => setModal({ type: 'create', categoryType: 'income' })}
            onEdit={(c) => setModal({ type: 'edit', category: c })}
            onDelete={(c) => { setDeleteError(null); setModal({ type: 'delete', category: c }) }}
          />
        </div>
      </div>

      {modal.type === 'create' && (
        <Modal
          title={`Nova categoria de ${modal.categoryType === 'expense' ? 'despesa' : 'receita'}`}
          onClose={() => setModal({ type: 'closed' })}
        >
          <CategoryForm
            fixedType={modal.categoryType}
            onSubmit={handleCreate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Criar categoria"
          />
        </Modal>
      )}

      {modal.type === 'edit' && (
        <Modal title="Editar categoria" onClose={() => setModal({ type: 'closed' })}>
          <CategoryForm
            defaultValues={modal.category}
            fixedType={modal.category.type}
            onSubmit={handleUpdate}
            onCancel={() => setModal({ type: 'closed' })}
            submitLabel="Salvar alterações"
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

// ─── Category List ─────────────────────────────────────────────────────────────

function CategoryList({
  title,
  icon,
  accent,
  categories,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string
  icon: React.ReactNode
  accent: 'red' | 'green'
  categories: Category[]
  onAdd: () => void
  onEdit: (c: Category) => void
  onDelete: (c: Category) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
            {categories.length}
          </span>
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
          Nova
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="py-10 text-center text-gray-400">
          <p className="text-sm">Nenhuma categoria ainda.</p>
          <button onClick={onAdd} className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
            Adicionar primeira
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {categories.map((category) => (
            <CategoryItem
              key={category.id}
              category={category}
              onEdit={() => onEdit(category)}
              onDelete={() => onDelete(category)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Category Item ─────────────────────────────────────────────────────────────

function CategoryItem({
  category,
  onEdit,
  onDelete,
}: {
  category: Category
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3 group hover:bg-gray-50 transition-colors">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
        style={{ backgroundColor: category.color ? `${category.color}20` : '#f3f4f6' }}
      >
        {category.icon ? (
          <span>{category.icon}</span>
        ) : (
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: category.color ?? '#64748b' }}
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{category.name}</p>
        {category.is_default && (
          <p className="text-xs text-gray-400">Padrão</p>
        )}
      </div>

      <div
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: category.color ?? '#64748b' }}
      />

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        {!category.is_default && (
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </li>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
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
