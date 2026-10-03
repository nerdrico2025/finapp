/**
 * Supabase falso em memória para testar server actions. Cobre só os métodos
 * usados por transactions.ts / transfer-writes.ts. `failInsert` decide, por
 * insert, se ele falha com um erro do Postgres (ex.: 23505).
 */

type Row = Record<string, unknown>
type PgError = { message: string; code: string }

export const UNIQUE_ERROR: PgError = {
  message: 'duplicate key value violates unique constraint "transactions_dedup_idx"',
  code: '23505',
}

export function createFakeSupabase(opts: {
  userId?: string
  failInsert?: (row: Row, n: number) => PgError | null
} = {}) {
  const tables: Record<string, Row[]> = { transactions: [], accounts: [] }
  const inserts: Row[] = []
  let seq = 0

  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = []
    let mode: 'select' | 'update' | 'delete' = 'select'
    let patch: Row = {}
    let limit = Infinity
    let countOnly = false

    const rows = () => (tables[table] ??= []).filter(r => filters.every(f => f(r)))
    const run = (): { data: Row[] | null; error: PgError | null; count?: number } => {
      if (mode === 'update') {
        const updated = rows()
        updated.forEach(r => Object.assign(r, patch))
        return { data: updated, error: null }
      }
      if (mode === 'delete') {
        const del = new Set(rows())
        tables[table] = tables[table].filter(r => !del.has(r))
        return { data: null, error: null }
      }
      if (countOnly) return { data: null, error: null, count: rows().length }
      return { data: rows().slice(0, limit), error: null }
    }

    const builder = {
      select: (_cols?: string, o?: { count?: string; head?: boolean }) => {
        if (o?.head) countOnly = true
        return builder
      },
      eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return builder },
      neq: (k: string, v: unknown) => { filters.push(r => r[k] !== v); return builder },
      is: (k: string, v: unknown) => { filters.push(r => (r[k] ?? null) === v); return builder },
      in: (k: string, vs: unknown[]) => { filters.push(r => vs.includes(r[k])); return builder },
      gte: (k: string, v: string) => { filters.push(r => String(r[k]) >= v); return builder },
      lte: (k: string, v: string) => { filters.push(r => String(r[k]) <= v); return builder },
      lt: (k: string, v: string) => { filters.push(r => String(r[k]) < v); return builder },
      order: () => builder,
      range: () => builder,
      limit: (n: number) => { limit = n; return builder },
      maybeSingle: async () => { const { data } = run(); return { data: data?.[0] ?? null, error: null } },
      single: async () => { const { data } = run(); return { data: data?.[0] ?? null, error: null } },
      update: (p: Row) => { mode = 'update'; patch = p; return builder },
      delete: () => { mode = 'delete'; return builder },
      insert: (row: Row) => {
        inserts.push({ ...row })
        const error = opts.failInsert?.(row, inserts.length) ?? null
        const saved = error ? null : { id: (row.id as string) ?? `tx-${++seq}`, ...row }
        if (saved) (tables[table] ??= []).push(saved)
        const result = { data: saved, error }
        const chain = {
          select: () => chain,
          single: async () => result,
          then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
        }
        return chain
      },
      then: (resolve: (v: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
    }
    return builder
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: opts.userId ?? 'user-1' } } }) },
    from,
  }
  return { client, tables, inserts }
}
