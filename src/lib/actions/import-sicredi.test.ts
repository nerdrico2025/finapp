import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createFakeSupabase } from '@/test/fake-supabase'
import { csvToRaw } from '@/lib/import/csv'
import { parseSicrediCsv, detectSicrediCsv, checkBalanceChain } from '@/lib/import/profiles/sicredi'
import { generateImportHash } from '@/lib/import/import-hash'
import { collectBankIds, dropKnownBankIds } from '@/lib/import/known-ids'
import type { ParsedRow } from '@/lib/actions/import'

let fake = createFakeSupabase()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }))
vi.mock('@/lib/entity', () => ({ getActiveEntityId: async () => 'entity-1' }))
vi.mock('@/lib/plan-server', () => ({ getUserPlanLimits: async () => ({ maxTransactionsPerMonth: null }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { importTransactions, findKnownBankTransactionIds, type CSVRow } from './transactions'

beforeEach(() => { fake = createFakeSupabase() })

const FIXTURE = readFileSync(fileURLToPath(new URL('../import/__fixtures__/sicredi-extrato.csv', import.meta.url)), 'utf8')
const HEADER = 'Data;Descricao;CodTransacao;Identificador;Tipo;Valor;Saldo'

function sicrediRows(text: string): ParsedRow[] {
  const { headers, rawRows } = csvToRaw(text)
  return parseSicrediCsv(headers, rawRows)
}

/** Mesma conversão de handleImport (ImportCSVForm). */
function toCSVRow(r: ParsedRow, account_id = 'acc-sicredi'): CSVRow {
  return {
    date: r.date,
    description: r.description,
    amount: r.type === 'expense' ? -Math.abs(r.amount) : Math.abs(r.amount),
    account_id,
    bank_transaction_id: r.bankTransactionId ?? null,
    hash_salt: r.hashSalt ?? null,
  }
}

describe('generateImportHash', () => {
  it('regressão: sem sal, o hash é o mesmo de antes da mudança', () => {
    // Valores calculados com a implementação anterior (md5 de "user|valor|data|descrição").
    expect(generateImportHash('user-1', 150, '2026-09-10', 'PIX FULANO')).toBe('9dda6d66e49d8e34e8fc282c615ff4a9')
    expect(generateImportHash('user-1', 1913.44, '2026-03-01', '  Compra Cartão ')).toBe('fc4d5320b405d34b2d2508030f88de42')
    expect(generateImportHash('user-1', 150, '2026-09-10', 'PIX FULANO', null)).toBe('9dda6d66e49d8e34e8fc282c615ff4a9')
    expect(generateImportHash('user-1', 150, '2026-09-10', 'PIX FULANO', '')).toBe('9dda6d66e49d8e34e8fc282c615ff4a9')
  })

  it('com sal, linhas iguais em data/valor/descrição geram hashes diferentes', () => {
    const a = generateImportHash('user-1', 5, '2026-11-05', 'PAGAMENTO PIX - X', 'sicredi:ID1')
    const b = generateImportHash('user-1', 5, '2026-11-05', 'PAGAMENTO PIX - X', 'sicredi:ID2')
    expect(a).not.toBe(b)
    expect(a).not.toBe(generateImportHash('user-1', 5, '2026-11-05', 'PAGAMENTO PIX - X'))
  })

  it('fixture do Sicredi: 27 hashes distintos', () => {
    const rows = sicrediRows(FIXTURE)
    const hashes = rows.map(r => generateImportHash('user-1', Math.abs(r.amount), r.date, r.description, r.hashSalt))
    expect(new Set(hashes).size).toBe(27)
  })
})

describe('Camada 1 (id do banco) — Sicredi', () => {
  it('reimportar o mesmo arquivo: todas as linhas caem na Camada 1, na prévia e ao salvar', async () => {
    const rows = sicrediRows(FIXTURE)
    const first = await importTransactions(rows.map(r => toCSVRow(r)))
    expect(first).toMatchObject({ inserted: 27, duplicates: 0, errors: 0 })

    // Prévia: o mesmo filtro do ImportCSVForm (findKnownBankTransactionIds + dropKnownBankIds).
    const known = new Set(await findKnownBankTransactionIds(collectBankIds(rows)))
    expect(known.size).toBe(27)
    expect(dropKnownBankIds(rows, known)).toEqual({ rows: [], skipped: 27 })

    // Ao salvar (janela de corrida entre a prévia e o clique): id do banco também barra.
    const again = await importTransactions(rows.map(r => toCSVRow(r)))
    expect(again).toMatchObject({ inserted: 0, duplicates: 27, errors: 0 })
    expect(fake.tables.transactions).toHaveLength(27)
  })

  it('grava bank_transaction_id com prefixo e o import_hash com sal', async () => {
    const [row] = sicrediRows(FIXTURE)
    await importTransactions([toCSVRow(row)])
    const saved = fake.tables.transactions[0]
    expect(saved.bank_transaction_id).toBe('sicredi:E7003823720261106010356bUkCXxO0I')
    expect(saved.import_hash).toBe(generateImportHash('user-1', 5, '2026-11-05', row.description, row.bankTransactionId))
  })

  it('duas linhas iguais em data/valor/descrição com Identificadores diferentes: ambas entram', async () => {
    const rows = sicrediRows([
      HEADER,
      '05/11/2026;PAGAMENTO PIX - 11122233344 JOAO TITULAR EXEMPLO;664;ID-A;DEBITO;- R$ 80,00;R$ 20,00',
      '05/11/2026;PAGAMENTO PIX - 11122233344 JOAO TITULAR EXEMPLO;664;ID-B;DEBITO;- R$ 80,00;R$ 100,00',
    ].join('\n'))
    const res = await importTransactions(rows.map(r => toCSVRow(r)))
    expect(res).toMatchObject({ inserted: 2, duplicates: 0 })
    const [a, b] = fake.tables.transactions
    expect(a.import_hash).not.toBe(b.import_hash)
  })

  it('formato sem id (CSV genérico/OFX sem sal): hash e dedup inalterados', async () => {
    const line: CSVRow = { date: '2026-09-10', description: 'PIX FULANO', amount: -150, account_id: 'acc-itau' }
    await importTransactions([line])
    const again = await importTransactions([line])
    expect(again).toMatchObject({ inserted: 0, duplicates: 1 })
    expect(fake.tables.transactions[0].import_hash).toBe('9dda6d66e49d8e34e8fc282c615ff4a9')
  })
})

describe('dropKnownBankIds', () => {
  it('linhas sem id nunca são puladas', () => {
    const rows = [{ bankTransactionId: undefined }, { bankTransactionId: 'X' }, { bankTransactionId: null }]
    expect(dropKnownBankIds(rows, new Set(['X']))).toEqual({ rows: [rows[0], rows[2]], skipped: 1 })
    expect(collectBankIds([{ bankTransactionId: 'X' }, { bankTransactionId: 'X' }, {}])).toEqual(['X'])
  })
})

describe('aceite — fixture anonimizada do Sicredi', () => {
  it('lê, assina, identifica e confere o saldo do extrato inteiro', () => {
    const { headers } = csvToRaw(FIXTURE)
    expect(detectSicrediCsv(headers)).toBe(true)
    const rows = sicrediRows(FIXTURE)
    const total = (xs: ParsedRow[]) => Math.round(xs.reduce((a, r) => a + Math.abs(r.amount), 0) * 100) / 100
    const income = rows.filter(r => r.type === 'income')
    const expense = rows.filter(r => r.type === 'expense')

    expect(rows).toHaveLength(27)
    expect([income.length, total(income)]).toEqual([8, 13060.95])
    expect([expense.length, total(expense)]).toEqual([19, 11693.35])
    expect(rows.some(r => r.amount === 0)).toBe(false)
    expect(rows.some(r => /^(DEBITO|CREDITO)/.test(r.description))).toBe(false)
    expect(rows.every(r => r.bankTransactionId?.startsWith('sicredi:'))).toBe(true)
    expect(new Set(rows.map(r => r.bankTransactionId)).size).toBe(27)
    expect(new Set(rows.map(r => generateImportHash('user-1', Math.abs(r.amount), r.date, r.description, r.hashSalt))).size).toBe(27)
    expect(checkBalanceChain(rows)).toEqual({ ok: true, openingBalance: 0, closingBalance: 1367.6 })
  })
})
