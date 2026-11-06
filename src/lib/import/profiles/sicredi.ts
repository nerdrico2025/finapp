/**
 * Perfil do extrato CSV do Sicredi.
 *
 * Cabeçalho: Data;Descricao;CodTransacao;Identificador;Tipo;Valor;Saldo
 *   - Data: dd/mm/yyyy (data de lançamento)
 *   - Valor: sinal e moeda separados por espaço ("- R$ 5,00", "+ R$ 1.220,00")
 *   - Tipo: DEBITO | CREDITO
 *   - Identificador: único por lançamento (E2E do PIX, OC-… em boleto, UUID…)
 *   - Saldo: saldo corrente após o lançamento; arquivo do mais recente para o
 *     mais antigo.
 *
 * Funções puras: quem chama (ImportCSVForm) faz a leitura com csvToRaw.
 */

import type { ParsedRow } from '@/lib/actions/import'
import { normalizeDate, tryParseAmount, AMOUNT_NOT_RECOGNIZED } from '@/lib/import/csv'

export const SICREDI_ID_PREFIX = 'sicredi:'
export const SIGN_TYPE_MISMATCH = 'Sinal e tipo divergentes'
export const UNKNOWN_DIRECTION = 'Sem sinal no valor e tipo não reconhecido'

const SICREDI_COLUMNS = ['data', 'descricao', 'codtransacao', 'identificador', 'tipo', 'valor', 'saldo'] as const
type SicrediColumn = typeof SICREDI_COLUMNS[number]

/** Minúsculo, sem acento, sem BOM, sem aspas, sem espaços nas pontas. */
function normalizeHeader(h: string): string {
  return String(h ?? '')
    .replace(/^﻿/, '')
    .replace(/['"]/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** O cabeçalho tem exatamente as sete colunas do Sicredi (em qualquer ordem). */
export function detectSicrediCsv(header: string[]): boolean {
  const cols = header.map(normalizeHeader)
  if (cols.length !== SICREDI_COLUMNS.length) return false
  const set = new Set(cols)
  return set.size === SICREDI_COLUMNS.length && SICREDI_COLUMNS.every(c => set.has(c))
}

function columnIndex(header: string[]): Record<SicrediColumn, number> {
  const cols = header.map(normalizeHeader)
  return Object.fromEntries(SICREDI_COLUMNS.map(c => [c, cols.indexOf(c)])) as Record<SicrediColumn, number>
}

/** Sinal explícito no texto do valor, ignorando "R$" e espaços. */
function explicitSign(cell: string): -1 | 1 | null {
  const s = cell.replace(/R\$/gi, '').replace(/[\s ]+/g, '')
  if (s.startsWith('-')) return -1
  if (s.startsWith('+')) return 1
  return null
}

function typeSign(tipo: string): -1 | 1 | null {
  const t = normalizeHeader(tipo)
  if (t === 'debito') return -1
  if (t === 'credito') return 1
  return null
}

/**
 * Converte as linhas de dados (sem o cabeçalho) em ParsedRow, na ordem do
 * arquivo. A direção vem do sinal do Valor; sem sinal, do Tipo. Sinal e Tipo
 * divergentes geram um aviso (linha desmarcada, mas importável).
 */
export function parseSicrediCsv(header: string[], rawRows: string[][]): ParsedRow[] {
  const idx = columnIndex(header)
  const cell = (parts: string[], c: SicrediColumn) => (parts[idx[c]] ?? '').trim()

  return rawRows
    .filter(parts => parts.some(p => p.trim() !== ''))
    .map((parts): ParsedRow => {
      const raw = parts.join(';')
      const rawDate = cell(parts, 'data')
      const description = cell(parts, 'descricao').replace(/\s+/g, ' ').trim()
      const valueCell = cell(parts, 'valor')
      const identifier = cell(parts, 'identificador')
      const bankTransactionId = identifier ? `${SICREDI_ID_PREFIX}${identifier}` : undefined
      const base = {
        description,
        raw,
        bankTransactionId,
        hashSalt: bankTransactionId,
        balance: tryParseAmount(cell(parts, 'saldo')),
      }

      const date = normalizeDate(rawDate)
      if (!date) {
        return { ...base, date: '', amount: 0, type: 'expense', error: `Data inválida: "${rawDate || '(vazio)'}"` }
      }

      const parsed = tryParseAmount(valueCell)
      if (parsed === null) {
        return { ...base, date, amount: 0, type: 'expense', error: `${AMOUNT_NOT_RECOGNIZED}: "${valueCell}" (${description})` }
      }

      const magnitude = Math.abs(parsed)
      const bySign = explicitSign(valueCell)
      const byType = typeSign(cell(parts, 'tipo'))
      const sign = bySign ?? byType ?? 1
      let warning: string | undefined
      if (bySign !== null && byType !== null && bySign !== byType) warning = SIGN_TYPE_MISMATCH
      else if (bySign === null && byType === null) warning = UNKNOWN_DIRECTION

      const amount = sign * magnitude
      return {
        ...base,
        date,
        amount,
        type: amount >= 0 ? 'income' : 'expense',
        ...(warning ? { warning } : {}),
      }
    })
}

// ─── Conferência da coluna Saldo ──────────────────────────────────────────────

export interface BalanceChainResult {
  ok: boolean
  /** Saldo antes do lançamento mais antigo. */
  openingBalance: number | null
  /** Saldo após o lançamento mais recente. */
  closingBalance: number | null
  /** Índice (na ordem do arquivo) da primeira linha em que a cadeia quebrou. */
  brokenAtIndex?: number
}

const cents = (n: number) => Math.round(n * 100)

/**
 * Confere se a coluna Saldo fecha com os valores lidos. Tenta primeiro a
 * ordem do Sicredi (mais recente primeiro: saldo[i+1] + valor[i] = saldo[i])
 * e depois a inversa (arquivo crescente: saldo[i] + valor[i+1] = saldo[i+1]),
 * com tolerância de 1 centavo. Linhas com erro ficam de fora.
 */
export function checkBalanceChain(rows: Pick<ParsedRow, 'amount' | 'balance' | 'error'>[]): BalanceChainResult {
  const indexed = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !r.error && typeof r.balance === 'number' && Number.isFinite(r.balance))
  const n = indexed.length
  if (n === 0) return { ok: false, openingBalance: null, closingBalance: null }

  const bal = (k: number) => indexed[k].r.balance as number
  const amt = (k: number) => indexed[k].r.amount

  // Primeira quebra na ordem decrescente (k = mais recente).
  const breakDesc = (): number | null => {
    for (let k = 0; k < n - 1; k++) {
      if (Math.abs(cents(bal(k + 1) + amt(k)) - cents(bal(k))) > 1) return k
    }
    return null
  }
  const breakAsc = (): number | null => {
    for (let k = 0; k < n - 1; k++) {
      if (Math.abs(cents(bal(k) + amt(k + 1)) - cents(bal(k + 1))) > 1) return k + 1
    }
    return null
  }

  const desc = breakDesc()
  if (desc === null) {
    return {
      ok: true,
      openingBalance: (cents(bal(n - 1)) - cents(amt(n - 1))) / 100,
      closingBalance: bal(0),
    }
  }
  const asc = breakAsc()
  if (asc === null) {
    return {
      ok: true,
      openingBalance: (cents(bal(0)) - cents(amt(0))) / 100,
      closingBalance: bal(n - 1),
    }
  }
  return { ok: false, openingBalance: null, closingBalance: null, brokenAtIndex: indexed[desc].i }
}
