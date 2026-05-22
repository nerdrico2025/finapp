'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Sparkles, Trash2, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/cn'

type Priority = 'alta' | 'media' | 'baixa'

interface DreamItem {
  id: string
  list_id: string
  text: string
  done: boolean
  priority: Priority
  created_at: string
}

interface DreamList {
  id: string
  user_id: string
  title: string
  target_date: string
  created_at: string
  dream_items: DreamItem[]
}

type Modal =
  | { type: 'closed' }
  | { type: 'create-list' }
  | { type: 'add-item' }
  | { type: 'delete-list'; list: DreamList }

interface Props {
  initialLists: DreamList[]
}

const PRIORITY_ORDER: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 }
const PRIORITY_LABELS: Record<Priority, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
const PRIORITY_COLORS: Record<Priority, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-amber-100 text-amber-700',
  baixa: 'bg-gray-100 text-gray-600',
}

function sortItems(items: DreamItem[]) {
  const pending = [...items.filter((i) => !i.done)].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  )
  return [...pending, ...items.filter((i) => i.done)]
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDateBR(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function defaultTargetDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

// ─── Thermometer ──────────────────────────────────────────────────────────────

function Thermometer({ progress }: { progress: number }) {
  const p = Math.min(100, Math.max(0, progress))

  let fillColor = '#f97316'
  if (p >= 75) fillColor = '#10b981'
  else if (p >= 50) fillColor = '#3b82f6'
  else if (p >= 25) fillColor = '#f59e0b'

  const tubeTop = 10
  const tubeBottom = 118
  const tubeHeight = tubeBottom - tubeTop
  const fillHeight = (p / 100) * tubeHeight
  const fillY = Math.max(tubeTop + 2, tubeBottom - fillHeight)

  let emoji = '🌙', label = 'Ainda longe', desc = 'Seus sonhos esperam'
  if (p >= 100) { emoji = '🌟'; label = 'Completo!'; desc = 'Tudo realizado!' }
  else if (p >= 75) { emoji = '🚀'; label = 'Quase lá!'; desc = 'Falta pouco!' }
  else if (p >= 50) { emoji = '😊'; label = 'No caminho'; desc = 'Continue assim!' }
  else if (p >= 25) { emoji = '🌱'; label = 'Começando'; desc = 'Bom começo!' }

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width="48" height="160" viewBox="0 0 48 160">
        {/* tube bg */}
        <rect x="16" y="10" width="16" height="108" rx="8" fill="#f3f4f6" />
        {/* bulb bg */}
        <circle cx="24" cy="138" r="16" fill="#f3f4f6" />
        {p > 0 && (
          <>
            {/* tube fill — extends slightly past tubeBottom to connect with bulb */}
            <rect
              x="18"
              y={fillY}
              width="12"
              height={tubeBottom - fillY + 16}
              rx="6"
              fill={fillColor}
            />
            {/* bulb fill */}
            <circle cx="24" cy="138" r="14" fill={fillColor} />
          </>
        )}
        {/* tube border */}
        <rect x="16" y="10" width="16" height="108" rx="8" fill="none" stroke="#d1d5db" strokeWidth="1.5" />
        {/* bulb border */}
        <circle cx="24" cy="138" r="16" fill="none" stroke="#d1d5db" strokeWidth="1.5" />
      </svg>
      <div className="text-center">
        <div className="text-xl leading-none">{emoji}</div>
        <div className="text-xs font-semibold text-gray-700 mt-1">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
      </div>
    </div>
  )
}

// ─── ModalShell ───────────────────────────────────────────────────────────────

function ModalShell({
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
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
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

// ─── Create List Modal ────────────────────────────────────────────────────────

function CreateListModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (title: string, targetDate: string) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [targetDate, setTargetDate] = useState(defaultTargetDate())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Informe o nome da lista'); return }
    const today = new Date().toISOString().split('T')[0]
    if (targetDate <= today) { setError('O prazo deve ser uma data futura'); return }
    setLoading(true)
    await onSubmit(title.trim(), targetDate)
    setLoading(false)
  }

  return (
    <ModalShell title="Nova Lista" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome da lista</label>
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Sonhos para 2026"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Prazo</label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex justify-center items-center py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar lista'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────

function AddItemModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (text: string, priority: Priority) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<Priority>('media')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) { setError('Descreva o seu sonho'); return }
    setLoading(true)
    await onSubmit(text.trim(), priority)
    setLoading(false)
  }

  function priorityBtnClass(p: Priority) {
    const active = priority === p
    if (!active) return 'flex-1 py-2 text-sm font-medium rounded-lg border-2 border-gray-200 text-gray-500 hover:border-gray-300 transition-colors'
    if (p === 'alta') return 'flex-1 py-2 text-sm font-medium rounded-lg border-2 bg-red-50 border-red-400 text-red-700'
    if (p === 'media') return 'flex-1 py-2 text-sm font-medium rounded-lg border-2 bg-amber-50 border-amber-400 text-amber-700'
    return 'flex-1 py-2 text-sm font-medium rounded-lg border-2 bg-gray-100 border-gray-400 text-gray-700'
  }

  return (
    <ModalShell title="Adicionar Sonho" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Descreva o seu sonho
          </label>
          <textarea
            autoFocus
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex: Fazer uma viagem para o Japão..."
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Prioridade</label>
          <div className="flex gap-2">
            {(['alta', 'media', 'baixa'] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={priorityBtnClass(p)}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex justify-center items-center py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Delete List Modal ────────────────────────────────────────────────────────

function DeleteListModal({
  list,
  onClose,
  onConfirm,
}: {
  list: DreamList
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }

  return (
    <ModalShell title="Excluir lista" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Excluir a lista{' '}
          <span className="font-semibold text-gray-900">{list.title}</span>?
          Todos os sonhos desta lista serão perdidos permanentemente.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex-1 flex justify-center items-center py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Excluir'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DreamListClient({ initialLists }: Props) {
  const [modal, setModal] = useState<Modal>({ type: 'closed' })
  const [activeListId, setActiveListId] = useState<string | null>(
    initialLists[0]?.id ?? null
  )
  const router = useRouter()

  function closeModal() { setModal({ type: 'closed' }) }
  function refresh() { router.refresh(); closeModal() }

  const activeList = useMemo(
    () => initialLists.find((l) => l.id === activeListId) ?? initialLists[0] ?? null,
    [initialLists, activeListId]
  )
  const items = activeList ? sortItems(activeList.dream_items) : []
  const total = items.length
  const done = items.filter((i) => i.done).length
  const progress = total === 0 ? 0 : Math.round((done / total) * 100)
  const days = activeList ? daysUntil(activeList.target_date) : 0

  async function handleCreateList(title: string, targetDate: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Sessão expirada'); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('dream_lists').insert({
      title, target_date: targetDate, user_id: user.id,
    })
    if (error) { toast.error('Erro ao criar lista'); return }
    toast.success('Lista criada!')
    refresh()
  }

  async function handleAddItem(text: string, priority: Priority) {
    if (!activeList) return
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('dream_items').insert({
      list_id: activeList.id, text, priority,
    })
    if (error) { toast.error('Erro ao adicionar sonho'); return }
    toast.success('Sonho adicionado!')
    refresh()
  }

  async function handleToggleItem(item: DreamItem) {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('dream_items')
      .update({ done: !item.done })
      .eq('id', item.id)
    if (error) { toast.error('Erro ao atualizar sonho'); return }
    router.refresh()
  }

  async function handleDeleteItem(id: string) {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('dream_items').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir sonho'); return }
    toast.success('Sonho removido')
    router.refresh()
  }

  async function handleDeleteList(listId: string) {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('dream_lists').delete().eq('id', listId)
    if (error) { toast.error('Erro ao excluir lista'); return }
    toast.success('Lista excluída!')
    refresh()
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Lista de Sonhos</h1>
          <button
            onClick={() => setModal({ type: 'create-list' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Lista
          </button>
        </div>

        {/* Empty state */}
        {initialLists.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">Nenhuma lista criada ainda.</p>
            <p className="text-xs text-gray-400 mt-1">Crie sua primeira lista de sonhos!</p>
            <button
              onClick={() => setModal({ type: 'create-list' })}
              className="mt-4 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Criar primeira lista
            </button>
          </div>
        ) : (
          <>
            {/* Tabs — only shown when more than one list */}
            {initialLists.length > 1 && (
              <div className="bg-gray-100 p-1 rounded-xl flex gap-1 overflow-x-auto">
                {initialLists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => setActiveListId(list.id)}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                      activeList?.id === list.id
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {list.title}
                  </button>
                ))}
              </div>
            )}

            {/* Content grid */}
            {activeList && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left column */}
                <div className="space-y-4">
                  {/* Progress card */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">{activeList.title}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Prazo: {formatDateBR(activeList.target_date)}
                      </p>
                      <p
                        className={cn(
                          'text-xs font-medium mt-1',
                          days < 0
                            ? 'text-red-500'
                            : days <= 30
                            ? 'text-amber-500'
                            : 'text-gray-500'
                        )}
                      >
                        {days < 0
                          ? `${Math.abs(days)} dias em atraso`
                          : days === 0
                          ? 'Prazo hoje!'
                          : `${days} dias restantes`}
                      </p>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Progresso</span>
                        <span className="font-semibold text-gray-700">{progress}%</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Mini stat cards */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-emerald-600">{done}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Realizados</p>
                      </div>
                      <div className="bg-white border border-gray-100 rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-gray-700">{total - done}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Pendentes</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setModal({ type: 'delete-list', list: activeList })}
                      className="w-full text-xs text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg py-1.5 transition-colors"
                    >
                      Excluir esta lista
                    </button>
                  </div>

                  {/* Thermometer card */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 flex justify-center">
                    <Thermometer progress={progress} />
                  </div>
                </div>

                {/* Right column */}
                <div className="lg:col-span-2">
                  <div className="bg-white rounded-2xl border border-gray-100">
                    {/* Card header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                        Meus Sonhos
                        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 font-normal">
                          {total}
                        </span>
                      </h3>
                      <button
                        onClick={() => setModal({ type: 'add-item' })}
                        className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Adicionar sonho
                      </button>
                    </div>

                    {/* Items list */}
                    {items.length === 0 ? (
                      <div className="py-12 text-center">
                        <p className="text-sm text-gray-400">Nenhum sonho adicionado ainda.</p>
                        <button
                          onClick={() => setModal({ type: 'add-item' })}
                          className="mt-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                        >
                          Adicionar o primeiro sonho
                        </button>
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-50">
                        {items.map((item) => (
                          <li
                            key={item.id}
                            className={cn(
                              'flex items-center gap-3 px-5 py-3.5 group transition-colors',
                              item.done
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'hover:bg-gray-50'
                            )}
                          >
                            {/* Circular checkbox */}
                            <button
                              onClick={() => handleToggleItem(item)}
                              className={cn(
                                'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                                item.done
                                  ? 'bg-emerald-600 border-emerald-600'
                                  : 'border-gray-300 hover:border-emerald-500'
                              )}
                            >
                              {item.done && (
                                <svg viewBox="0 0 10 8" className="w-3 h-2.5" fill="none">
                                  <path
                                    d="M1 4l3 3 5-6"
                                    stroke="white"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </button>

                            {/* Text */}
                            <span
                              className={cn(
                                'flex-1 text-sm',
                                item.done ? 'line-through text-gray-400' : 'text-gray-700'
                              )}
                            >
                              {item.text}
                            </span>

                            {/* Priority badge */}
                            <span
                              className={cn(
                                'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                                PRIORITY_COLORS[item.priority]
                              )}
                            >
                              {PRIORITY_LABELS[item.priority]}
                            </span>

                            {/* Delete button — visible on hover */}
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Celebration card — shown when all items are done */}
                    {progress === 100 && total > 0 && (
                      <div className="mx-4 mb-4 mt-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white text-center">
                        <div className="text-2xl mb-1">🎉</div>
                        <p className="text-sm font-semibold">Parabéns! Todos os sonhos realizados!</p>
                        <p className="text-xs text-emerald-100 mt-0.5">Que tal criar uma nova lista?</p>
                        <button
                          onClick={() => setModal({ type: 'create-list' })}
                          className="mt-3 px-4 py-1.5 bg-white text-emerald-600 text-xs font-semibold rounded-lg hover:bg-emerald-50 transition-colors"
                        >
                          Nova Lista
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {modal.type === 'create-list' && (
        <CreateListModal onClose={closeModal} onSubmit={handleCreateList} />
      )}
      {modal.type === 'add-item' && (
        <AddItemModal onClose={closeModal} onSubmit={handleAddItem} />
      )}
      {modal.type === 'delete-list' && (
        <DeleteListModal
          list={modal.list}
          onClose={closeModal}
          onConfirm={() => handleDeleteList(modal.list.id)}
        />
      )}
    </>
  )
}
