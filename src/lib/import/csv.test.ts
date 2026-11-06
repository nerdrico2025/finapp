import { describe, it, expect } from 'vitest'
import { parseAmount, tryParseAmount, normalizeDate, csvToRaw, detectColumns, isMappingValid, applyMapping, AMOUNT_NOT_RECOGNIZED } from './csv'

// ─── Caracterização: comportamento anterior à tolerância a "R$"/sinal ────────
// Estes casos já funcionavam antes da mudança e não podem mudar.

describe('parseAmount — caracterização (comportamento existente)', () => {
  it.each([
    ['-5,00', -5],
    ['5,00', 5],
    ['1.234,56', 1234.56],
    ['-1.913,44', -1913.44],
    ['1.234.567,89', 1234567.89],
    ['1,913.44', 1913.44],          // BTG (formato US)
    ['-1,913.44', -1913.44],
    ['1,234,567.89', 1234567.89],
    ['1234.56', 1234.56],
    ['1234,5', 1234.5],
    ['  10,00  ', 10],
    ['+10,00', 10],
    ['0,00', 0],
    ['0', 0],
    ['150', 150],
    ['-150', -150],
    ['1.234', 1.234],               // ponto sem vírgula é decimal (peculiaridade mantida)
    ['10,00 C', 10],                // texto depois do número é ignorado pelo parseFloat
  ])('%j → %d', (raw, expected) => {
    expect(parseAmount(raw)).toBeCloseTo(expected, 10)
  })

  it('vazio → 0', () => {
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('   ')).toBe(0)
    expect(parseAmount(undefined as unknown as string)).toBe(0)
  })

  it('texto inválido → 0', () => {
    expect(parseAmount('abc')).toBe(0)
    expect(parseAmount('-')).toBe(0)
  })
})

describe('normalizeDate', () => {
  it.each([
    ['05/11/2026', '2026-11-05'],
    ['05/11/26', '2026-11-05'],
    ['2026-11-05', '2026-11-05'],
    ['05-11-2026', '2026-11-05'],
    ['2026-11-05T10:00:00', '2026-11-05'],
    ['05/11/2026 10:00', '2026-11-05'],
    ['nan', ''],
    ['', ''],
    ['ontem', ''],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeDate(raw)).toBe(expected)
  })
})

describe('csvToRaw', () => {
  it('detecta ";" pelo cabeçalho, tolera CRLF e linha em branco final', () => {
    const { headers, rawRows } = csvToRaw('Data;Descrição;Valor\r\n01/01/2026;"A;B";-5,00\r\n\r\n')
    expect(headers).toEqual(['Data', 'Descrição', 'Valor'])
    expect(rawRows).toEqual([['01/01/2026', 'A;B', '-5,00']])
  })

  it('usa "," quando o cabeçalho não tem ";"', () => {
    const { headers, rawRows } = csvToRaw('date,description,amount\n2026-01-01,X,10\n')
    expect(headers).toEqual(['date', 'description', 'amount'])
    expect(rawRows).toEqual([['2026-01-01', 'X', '10']])
  })

  it('menos de duas linhas → vazio', () => {
    expect(csvToRaw('Data;Valor\n')).toEqual({ headers: [], rawRows: [] })
  })
})

describe('detectColumns / applyMapping (fluxo genérico)', () => {
  it('valor único com sinal', () => {
    const headers = ['Data', 'Descrição', 'Valor']
    const m = detectColumns(headers)
    expect(isMappingValid(m)).toBe(true)
    const rows = applyMapping(headers, [['10/09/2026', 'PIX FULANO', '-150,00'], ['11/09/2026', 'SALARIO', '1.000,00']], m)
    expect(rows).toMatchObject([
      { date: '2026-09-10', description: 'PIX FULANO', amount: -150, type: 'expense' },
      { date: '2026-09-11', description: 'SALARIO', amount: 1000, type: 'income' },
    ])
  })

  it('colunas de crédito e débito separadas', () => {
    const headers = ['Data', 'Histórico', 'Credito', 'Débito']
    const m = detectColumns(headers)
    const rows = applyMapping(headers, [['10/09/2026', 'A', '', '50,00'], ['10/09/2026', 'B', '20,00', '']], m)
    expect(rows.map(r => r.amount)).toEqual([-50, 20])
  })

  it('caracterização: "Crédito" com acento não é reconhecido como coluna de crédito', () => {
    // 'cred' não está contido em 'créd' — comportamento existente, fora do escopo.
    expect(detectColumns(['Data', 'Histórico', 'Crédito', 'Débito']).creditIdx).toBe(-1)
  })

  it('data inválida vira linha com erro; data vazia é ignorada', () => {
    const headers = ['Data', 'Descrição', 'Valor']
    const rows = applyMapping(headers, [['xx', 'A', '1,00'], ['', 'B', '1,00']], detectColumns(headers))
    expect(rows).toHaveLength(1)
    expect(rows[0].error).toMatch(/Data inválida/)
  })
})

// ─── Tolerância a "R$" e sinal separado ───────────────────────────────────────

describe('parseAmount / tryParseAmount — "R$" e sinal separado', () => {
  it.each([
    ['- R$ 5,00', -5],
    ['+ R$ 1.220,00', 1220],
    ['R$ 1.367,60', 1367.6],
    ['- R$ 1.701,32', -1701.32],
    ['-R$ 5,00', -5],
    ['R$ -5,00', -5],
    ['R$5,00', 5],
    ['r$ 5,00', 5],
    ['- 5,00', -5],
    ['R$ 1.234,56', 1234.56],
    ['R$ 1,913.44', 1913.44],
  ])('%j → %d', (raw, expected) => {
    expect(parseAmount(raw)).toBeCloseTo(expected, 10)
    expect(tryParseAmount(raw)).toBeCloseTo(expected, 10)
  })

  it('texto não numérico → null em tryParseAmount; vazio continua 0', () => {
    expect(tryParseAmount('abc')).toBeNull()
    expect(tryParseAmount('R$')).toBe(0)
    expect(tryParseAmount('-')).toBeNull()
    expect(tryParseAmount('')).toBe(0)
    expect(tryParseAmount('0,00')).toBe(0)
  })
})

describe('applyMapping — valor não reconhecido', () => {
  const headers = ['Data', 'Descrição', 'Valor']
  const m = detectColumns(headers)

  it('marca a linha como inválida em vez de virar 0', () => {
    const [row] = applyMapping(headers, [['10/09/2026', 'PIX X', 'abc']], m)
    expect(row.error).toMatch(new RegExp(AMOUNT_NOT_RECOGNIZED, 'i'))
    expect(row.error).toContain('"abc"')
    expect(row.date).toBe('2026-09-10')
  })

  it('valor zero real continua possível', () => {
    const [row] = applyMapping(headers, [['10/09/2026', 'TARIFA ESTORNADA', '0,00']], m)
    expect(row.error).toBeUndefined()
    expect(row.amount).toBe(0)
  })

  it('valor com "R$" e sinal separado', () => {
    const [row] = applyMapping(headers, [['10/09/2026', 'PIX X', '- R$ 5,00']], m)
    expect(row).toMatchObject({ amount: -5, type: 'expense' })
  })

  it('crédito/débito: célula vazia é 0, texto é inválido', () => {
    const h = ['Data', 'Histórico', 'Credito', 'Débito']
    const rows = applyMapping(h, [['10/09/2026', 'A', '', 'R$ 50,00'], ['10/09/2026', 'B', 'x', '']], detectColumns(h))
    expect(rows[0]).toMatchObject({ amount: -50, type: 'expense' })
    expect(rows[1].error).toMatch(/Valor não reconhecido/)
  })
})
