import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { csvToRaw } from '@/lib/import/csv'
import {
  detectSicrediCsv, parseSicrediCsv, checkBalanceChain, SICREDI_ID_PREFIX, SIGN_TYPE_MISMATCH, UNKNOWN_DIRECTION,
} from './sicredi'

const FIXTURE = readFileSync(fileURLToPath(new URL('../__fixtures__/sicredi-extrato.csv', import.meta.url)), 'utf8')

const HEADER = 'Data;Descricao;CodTransacao;Identificador;Tipo;Valor;Saldo'

function parse(text: string) {
  const { headers, rawRows } = csvToRaw(text)
  return { headers, rows: parseSicrediCsv(headers, rawRows) }
}

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100

describe('detectSicrediCsv', () => {
  it('reconhece o cabeçalho com BOM, acento, caixa e espaços', () => {
    expect(detectSicrediCsv(HEADER.split(';'))).toBe(true)
    expect(detectSicrediCsv(['﻿Data', ' Descrição ', 'CODTRANSACAO', 'Identificador', 'Tipo', 'Valor', 'Saldo'])).toBe(true)
  })

  it('não reconhece cabeçalhos de outros bancos', () => {
    expect(detectSicrediCsv(['Data', 'Descrição', 'Valor'])).toBe(false)
    expect(detectSicrediCsv(['Data', 'Descricao', 'CodTransacao', 'Identificador', 'Tipo', 'Valor'])).toBe(false)
    expect(detectSicrediCsv([...HEADER.split(';'), 'Extra'])).toBe(false)
    expect(detectSicrediCsv(['Data', 'Data', 'CodTransacao', 'Identificador', 'Tipo', 'Valor', 'Saldo'])).toBe(false)
  })
})

describe('parseSicrediCsv — fixture anonimizada', () => {
  const { headers, rows } = parse(FIXTURE)

  it('a fixture é detectada como Sicredi', () => {
    expect(detectSicrediCsv(headers)).toBe(true)
  })

  it('27 linhas, sem erro, sem aviso e sem valor 0', () => {
    expect(rows).toHaveLength(27)
    expect(rows.filter(r => r.error)).toEqual([])
    expect(rows.filter(r => r.warning)).toEqual([])
    expect(rows.filter(r => r.amount === 0)).toEqual([])
  })

  it('8 receitas somando 13.060,95 e 19 despesas somando 11.693,35', () => {
    const income = rows.filter(r => r.type === 'income')
    const expense = rows.filter(r => r.type === 'expense')
    expect(income).toHaveLength(8)
    expect(expense).toHaveLength(19)
    expect(sum(income.map(r => r.amount))).toBe(13060.95)
    expect(sum(expense.map(r => -r.amount))).toBe(11693.35)
    expect(rows.every(r => (r.type === 'income') === (r.amount > 0))).toBe(true)
  })

  it('descrição só da coluna Descricao, espaços colapsados', () => {
    expect(rows.some(r => /^(DEBITO|CREDITO)/i.test(r.description))).toBe(false)
    expect(rows.every(r => !/\s{2,}/.test(r.description))).toBe(true)
    expect(rows[0].description).toBe('PAGAMENTO PIX - 11122233344 JOAO TITULAR EXEMPLO')
    expect(rows[12].description).toBe('PAGAMENTO BOLETO - 10000000000606 CONDOMINIO EXEMPLO I')
  })

  it('bankTransactionId = "sicredi:<Identificador>", todos distintos; hashSalt igual ao id', () => {
    expect(rows.every(r => r.bankTransactionId?.startsWith(SICREDI_ID_PREFIX))).toBe(true)
    expect(new Set(rows.map(r => r.bankTransactionId)).size).toBe(27)
    expect(rows[0].bankTransactionId).toBe('sicredi:E7003823720261106010356bUkCXxO0I')
    expect(rows.every(r => r.hashSalt === r.bankTransactionId)).toBe(true)
  })

  it('data da coluna Data, na ordem do arquivo', () => {
    expect(rows[0]).toMatchObject({ date: '2026-11-05', amount: -5, type: 'expense', balance: 1367.6 })
    expect(rows[4]).toMatchObject({ date: '2026-11-04', amount: 1220, type: 'income' })
    expect(rows[26]).toMatchObject({ date: '2026-10-30', amount: 6500, balance: 6500 })
  })
})

describe('parseSicrediCsv — variantes sintéticas', () => {
  it('BOM + CRLF + linha em branco final', () => {
    const text = '﻿' + [HEADER, '05/11/2026;PIX A;664;ID1;DEBITO;- R$ 5,00;R$ 95,00', '04/11/2026;PIX B;668;ID2;CREDITO;+ R$ 100,00;R$ 100,00', '', ''].join('\r\n')
    const { headers, rows } = parse(text)
    expect(detectSicrediCsv(headers)).toBe(true)
    expect(rows.map(r => [r.date, r.amount, r.bankTransactionId])).toEqual([
      ['2026-11-05', -5, 'sicredi:ID1'],
      ['2026-11-04', 100, 'sicredi:ID2'],
    ])
  })

  it('Tipo divergente do sinal: aviso, direção pelo sinal', () => {
    const { rows } = parse([HEADER, '05/11/2026;PIX A;664;ID1;CREDITO;- R$ 5,00;R$ 95,00'].join('\n'))
    expect(rows[0]).toMatchObject({ amount: -5, type: 'expense', warning: SIGN_TYPE_MISMATCH })
    expect(rows[0].error).toBeUndefined()
  })

  it('sem sinal: direção pelo Tipo', () => {
    const { rows } = parse([HEADER, '05/11/2026;PIX A;664;ID1;DEBITO;R$ 5,00;R$ 95,00', '05/11/2026;PIX B;668;ID2;CREDITO;R$ 7,00;R$ 102,00'].join('\n'))
    expect(rows.map(r => [r.amount, r.type, r.warning])).toEqual([[-5, 'expense', undefined], [7, 'income', undefined]])
  })

  it('sem sinal e Tipo desconhecido: aviso', () => {
    const { rows } = parse([HEADER, '05/11/2026;PIX A;664;ID1;OUTRO;R$ 5,00;R$ 95,00'].join('\n'))
    expect(rows[0].warning).toBe(UNKNOWN_DIRECTION)
  })

  it('valor não numérico: linha inválida', () => {
    const { rows } = parse([HEADER, '05/11/2026;PIX A;664;ID1;DEBITO;R$ abc;R$ 95,00'].join('\n'))
    expect(rows[0].error).toMatch(/Valor não reconhecido/)
  })

  it('colunas em outra ordem', () => {
    const text = ['Valor;Data;Tipo;Descricao;Saldo;Identificador;CodTransacao', '- R$ 5,00;05/11/2026;DEBITO;PIX  A;R$ 95,00;ID1;664'].join('\n')
    const { headers, rows } = parse(text)
    expect(detectSicrediCsv(headers)).toBe(true)
    expect(rows[0]).toMatchObject({ date: '2026-11-05', description: 'PIX A', amount: -5, bankTransactionId: 'sicredi:ID1', balance: 95 })
  })
})

describe('checkBalanceChain', () => {
  it('fixture: fecha com abertura 0,00 e final 1.367,60', () => {
    const { rows } = parse(FIXTURE)
    expect(checkBalanceChain(rows)).toEqual({ ok: true, openingBalance: 0, closingBalance: 1367.6 })
  })

  it('arquivo em ordem crescente: a cadeia ainda fecha', () => {
    const lines = FIXTURE.replace(/^﻿/, '').split('\n').filter(Boolean)
    const asc = [lines[0], ...lines.slice(1).reverse()].join('\n')
    const { rows } = parse(asc)
    expect(rows[0].date).toBe('2026-10-30')
    expect(checkBalanceChain(rows)).toEqual({ ok: true, openingBalance: 0, closingBalance: 1367.6 })
  })

  it('tolerância de 1 centavo', () => {
    const rows = [{ amount: -5, balance: 95.01 }, { amount: 100, balance: 100 }]
    expect(checkBalanceChain(rows).ok).toBe(true)
  })

  it('saldo que não fecha: aponta a linha (índice na ordem do arquivo)', () => {
    const { rows } = parse([
      HEADER,
      '05/11/2026;C;664;ID3;DEBITO;- R$ 10,00;R$ 80,00',
      '05/11/2026;B;664;ID2;DEBITO;- R$ 5,00;R$ 95,00',
      '04/11/2026;A;668;ID1;CREDITO;+ R$ 100,00;R$ 100,00',
    ].join('\n'))
    expect(checkBalanceChain(rows)).toEqual({ ok: false, openingBalance: null, closingBalance: null, brokenAtIndex: 0 })
  })

  it('sem coluna de saldo legível: não ok', () => {
    expect(checkBalanceChain([{ amount: 1, balance: null }]).ok).toBe(false)
    expect(checkBalanceChain([]).ok).toBe(false)
  })
})
