import { describe, it, expect } from 'vitest'
import { summarizePartial } from './partial-summary'
import { describePartial, hasWriterPartial, monthRange, partialReturnPct, summarizeOptionsPeriod } from './period-summary'
import type { TradeOperation } from '@/types'

const trade = (over: Partial<TradeOperation> = {}) => ({
  id: 'x',
  type: 'options',
  option_type: 'call',
  position: 'holder',
  quantity: 1000,
  strike: 30,
  premium: 0.32,
  fees: 0,
  option_status: 'open',
  entry_date: '2026-10-10',
  exit_date: null,
  exit_price: null,
  current_premium: null,
  current_premium_updated_at: null,
  underlying_price_at_exercise: null,
  ...over,
}) as TradeOperation

const january = monthRange(1, 2027)
const closed = (exit_date: string, over: Partial<TradeOperation> = {}) =>
  trade({ option_status: 'closed', exit_price: 0.5, exit_date, ...over })

describe('summarizeOptionsPeriod', () => {
  it('realizado conta encerradas com saída no período, pela fórmula de computeOption', () => {
    const s = summarizeOptionsPeriod([closed('2027-01-15'), closed('2026-12-31'), closed('2027-02-01')], january.start, january.end)
    expect(s.closedCount).toBe(1)
    expect(s.realizedResult).toBeCloseTo(180)
  })

  it('aberta em outubro e encerrada em janeiro: janeiro sim, outubro não', () => {
    const op = [closed('2027-01-15')]
    const october = monthRange(10, 2026)
    expect(summarizeOptionsPeriod(op, january.start, january.end).closedCount).toBe(1)
    expect(summarizeOptionsPeriod(op, october.start, october.end).closedCount).toBe(0)
  })

  it('inclui exercidas e que viraram pó', () => {
    const s = summarizeOptionsPeriod([
      trade({ option_status: 'exercised', underlying_price_at_exercise: 32, exit_date: '2027-01-10' }),
      trade({ option_status: 'expired', exit_date: '2027-01-20' }),
    ], january.start, january.end)
    expect(s.closedCount).toBe(2)
    expect(s.realizedResult).toBeCloseTo(1680 - 320)
  })

  it('parcial considera todas as abertas, em qualquer período', () => {
    const s = summarizeOptionsPeriod([
      trade({ current_premium: 0.5, current_premium_updated_at: '2026-10-20T12:00:00Z' }),
      trade({ entry_date: '2020-01-01' }),
    ], january.start, january.end)
    expect(s.openCount).toBe(2)
    expect(s.partial.includedCount).toBe(1)
    expect(s.partial.result).toBeCloseTo(180)
    expect(s.missingPremiumCount).toBe(1)
    expect(s.realizedResult).toBe(0)
  })

  it('ignora swing e informa o total de opções de qualquer período', () => {
    const s = summarizeOptionsPeriod([
      trade({ type: 'swing', option_status: null }),
      closed('2020-05-05'),
    ], january.start, january.end)
    expect(s.totalCount).toBe(1)
    expect(s.closedCount).toBe(0)
    expect(s.openCount).toBe(0)
  })
})

describe('partialReturnPct', () => {
  const priced = (over: Partial<TradeOperation> = {}) =>
    trade({ current_premium: 0.5, current_premium_updated_at: '2026-10-20T12:00:00Z', ...over })

  it('parcial ÷ capital pago, com taxas no capital', () => {
    expect(partialReturnPct([priced()])).toBeCloseTo((180 / 320) * 100)
    expect(partialReturnPct([priced({ fees: 80 })])).toBeCloseTo((100 / 400) * 100)
  })

  it('soma várias operações antes de dividir', () => {
    expect(partialReturnPct([priced(), priced({ current_premium: 0.16 })])).toBeCloseTo((20 / 640) * 100)
  })

  it('resultado negativo dá percentual negativo', () => {
    expect(partialReturnPct([priced({ current_premium: 0.16 })])).toBeCloseTo(-50)
  })

  it('abertas sem prêmio atual ficam fora do numerador e do capital', () => {
    expect(partialReturnPct([priced(), trade()])).toBeCloseTo((180 / 320) * 100)
  })

  it('encerradas ficam fora', () => {
    expect(partialReturnPct([priced(), closed('2027-01-15')])).toBeCloseTo((180 / 320) * 100)
  })

  it('sem titular com capital: nulo', () => {
    expect(partialReturnPct([])).toBeNull()
    expect(partialReturnPct([trade()])).toBeNull()
  })

  it('só lançadores: nulo', () => {
    expect(partialReturnPct([priced({ position: 'writer', current_premium: 0.1 })])).toBeNull()
  })

  it('misto: titular +R$ 180 sobre R$ 320 dá +56,25%, e os reais somam +R$ 400', () => {
    const trades = [priced(), priced({ position: 'writer', current_premium: 0.1 })]
    expect(partialReturnPct(trades)).toBeCloseTo(56.25)
    expect(summarizePartial(trades).result).toBeCloseTo(400)
  })

  it('lançador com perda não altera o percentual', () => {
    const trades = [priced(), priced({ position: 'writer', current_premium: 1 })]
    expect(partialReturnPct(trades)).toBeCloseTo(56.25)
    expect(summarizePartial(trades).result).toBeCloseTo(180 - 680)
  })
})

describe('hasWriterPartial', () => {
  const priced = (over: Partial<TradeOperation> = {}) =>
    trade({ current_premium: 0.5, current_premium_updated_at: '2026-10-20T12:00:00Z', ...over })

  it('só é verdadeiro com lançador aberto que tem prêmio atual', () => {
    expect(hasWriterPartial([priced()])).toBe(false)
    expect(hasWriterPartial([priced({ position: 'writer' })])).toBe(true)
    expect(hasWriterPartial([trade({ position: 'writer' })])).toBe(false)
    expect(hasWriterPartial([priced({ position: 'writer', option_status: 'closed', exit_price: 0.1 })])).toBe(false)
  })
})

describe('monthRange', () => {
  it('cobre o mês inteiro, inclusive fevereiro bissexto', () => {
    expect(monthRange(1, 2027)).toEqual({ start: '2027-01-01', end: '2027-01-31' })
    expect(monthRange(2, 2028)).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(monthRange(12, 2026)).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })
})

describe('describePartial', () => {
  const base = { result: 0, includedCount: 0, missingPremiumCount: 0, oldestUpdatedAt: null }

  it('sem operações: nenhuma linha', () => {
    expect(describePartial(base)).toEqual({ details: null, warning: null })
  })

  it('singular e plural, com a data no fuso de São Paulo', () => {
    expect(describePartial({ ...base, includedCount: 1 }).details).toBe('1 aberta')
    expect(describePartial({ ...base, includedCount: 2, oldestUpdatedAt: '2026-10-31T01:00:00Z' }).details)
      .toBe('2 abertas · preços de 30/10')
  })

  it('aviso de operações sem prêmio', () => {
    expect(describePartial({ ...base, missingPremiumCount: 2 }).warning).toBe('2 sem prêmio atualizado')
  })
})
