// ─── Smart duplicate detection ──────────────────────────────────────────────
//
// Pure, framework-agnostic scoring used both server-side (manual entry and
// import) and for in-file deduplication. A duplicate is never auto-discarded —
// the score is surfaced to the user, who confirms whether to keep it.
//
// Signals (in order of strength):
//   • same value (hard gate — without it we don't even consider a match)
//   • same or nearby date (within DUP_DATE_WINDOW_DAYS)
//   • similar words in the description
//   • same category

export const DUP_DATE_WINDOW_DAYS = 4
export const DUP_SCORE_THRESHOLD = 70

// Common Portuguese filler + bank-statement noise that shouldn't drive matches.
const STOPWORDS = new Set([
  'de', 'da', 'do', 'dos', 'das', 'e', 'a', 'o', 'os', 'as', 'para', 'por',
  'com', 'no', 'na', 'em', 'um', 'uma', 'ltda', 'me', 'sa', 'eireli',
])

export interface ScoreInput {
  type: string
  amount: number // sign-agnostic — compared by absolute value
  date: string // yyyy-mm-dd
  description?: string | null
  categoryId?: string | null
}

export interface DuplicateMatch {
  /** id of the existing transaction, or `file:<index>` for an in-file match */
  id: string
  source: 'existing' | 'file'
  date: string
  amount: number
  description: string | null
  categoryName: string | null
  score: number
  reasons: string[]
}

export function normalizeText(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}

/** Jaccard similarity (0–1) between the word sets of two descriptions. */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = Array.from(new Set(tokenize(a)))
  const tb = new Set(tokenize(b))
  if (ta.length === 0 || tb.size === 0) return 0
  let inter = 0
  for (let i = 0; i < ta.length; i++) if (tb.has(ta[i])) inter++
  const union = ta.length + tb.size - inter
  return union === 0 ? 0 : inter / union
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime()
  const db = new Date(b + 'T00:00:00').getTime()
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY
  return Math.round(Math.abs(da - db) / 86_400_000)
}

function sameAmount(a: number, b: number): boolean {
  return Math.round(Math.abs(a) * 100) === Math.round(Math.abs(b) * 100)
}

export function addDays(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().split('T')[0]
}

/**
 * Score how likely `b` is a duplicate of `a`. Returns 0 when the value or the
 * type differs, or the dates are too far apart — those are not duplicates.
 */
export function scoreDuplicate(
  a: ScoreInput,
  b: ScoreInput
): { score: number; reasons: string[] } {
  if (a.type !== b.type) return { score: 0, reasons: [] }
  if (!sameAmount(a.amount, b.amount)) return { score: 0, reasons: [] }

  const days = daysBetween(a.date, b.date)
  if (days > DUP_DATE_WINDOW_DAYS) return { score: 0, reasons: [] }

  const reasons: string[] = ['Mesmo valor']
  let score = 40

  if (days === 0) {
    score += 25
    reasons.push('Mesma data')
  } else if (days <= 1) {
    score += 15
    reasons.push('Data próxima (1 dia)')
  } else if (days <= 3) {
    score += 8
    reasons.push(`Data próxima (${days} dias)`)
  } else {
    score += 4
    reasons.push(`Data próxima (${days} dias)`)
  }

  // A corroborating signal beyond value+date — without one, same value on the
  // same day is *not* enough to call it a duplicate (too many false positives).
  const sim = descriptionSimilarity(a.description ?? '', b.description ?? '')
  let corroborated = false
  if (sim >= 0.8) {
    score += 35
    corroborated = true
    reasons.push('Descrição quase idêntica')
  } else if (sim >= 0.5) {
    score += 25
    corroborated = true
    reasons.push('Descrição parecida')
  } else if (sim >= 0.25) {
    score += 12
    corroborated = true
    reasons.push('Algumas palavras em comum')
  }

  const sameCategory = !!(a.categoryId && b.categoryId && a.categoryId === b.categoryId)
  if (sameCategory) {
    score += 15
    corroborated = true
    reasons.push('Mesma categoria')
  }

  // Cap pure value+date matches below the threshold so they never flag alone.
  if (!corroborated) {
    score = Math.min(score, DUP_SCORE_THRESHOLD - 5)
  }

  return { score: Math.min(score, 100), reasons }
}

export function isDuplicateCandidate(a: ScoreInput, b: ScoreInput): boolean {
  return scoreDuplicate(a, b).score >= DUP_SCORE_THRESHOLD
}
