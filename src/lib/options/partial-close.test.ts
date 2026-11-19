import { describe, it, expect } from 'vitest'
import type { TradeOperation } from '@/types'
import { buildPartialClose, splitFees, validateClosedQuantity } from './partial-close'
import { LOT_WARNING } from './calc'

const trade = (over: Partial<TradeOperation> = {}): TradeOperation => ({
  id: 't1',
  user_id: 'u1',
  entity_id: 'e1',
  type: 'options',
  ticker: 'PETR4',
  entry_date: '2026-11-01',
  exit_date: null,
  entry_price: 0,
  exit_price: null,
  quantity: 1000,
  fees: 0,
  status: 'open',
  notes: 'nota',
  stop_loss: 0.2,
  target_price: 0.9,
  option_series: 'PETRL380',
  option_type: 'call',
  expiration_date: '2026-12-18',
  premium: 0.32,
  option_status: 'open',
  position: 'holder',
  strike: 38,
  underlying_price_at_exercise: null,
  current_premium: 0.7,
  current_premium_updated_at: '2026-11-18T12:00:00Z',
  google_event_id: 'ev-due',
  google_reminder_event_id: 'ev-rem',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  ...over,
})

const cents = (n: number) => Math.round(n * 100)

describe('buildPartialClose — titular', () => {
  it('critério de aceite: 1.000 a 0,32, encerra 500 a 0,80 → +240 e ficam 500', () => {
    const r = buildPartialClose({ trade: trade(), closedQuantity: 500, exitPremium: 0.8, exitDate: '2026-11-19' })
    expect(r.resultado).toBeCloseTo(240, 6)
    expect(r.closedRow.quantity).toBe(500)
    expect(r.remainingRow?.quantity).toBe(500)
    // rentabilidade sobre o desembolso da parte encerrada: 240 / (500 × 0,32)
    expect(r.rentabilidade).toBeCloseTo(150, 6)
  })

  it('a encerrada copia os dados de entrada e não leva eventos do Calendar', () => {
    const r = buildPartialClose({ trade: trade(), closedQuantity: 300, exitPremium: 0.5, exitDate: '2026-11-19' })
    const c = r.closedRow
    expect(c).not.toHaveProperty('id')
    expect(c).toMatchObject({
      ticker: 'PETR4', option_series: 'PETRL380', strike: 38, expiration_date: '2026-12-18',
      entry_date: '2026-11-01', premium: 0.32, position: 'holder', target_price: 0.9, stop_loss: 0.2,
      status: 'closed', option_status: 'closed', exit_price: 0.5, exit_date: '2026-11-19',
      google_event_id: null, google_reminder_event_id: null, current_premium: null,
    })
  })

  it('a original segue aberta com série, alvo, stop, prêmio atual e eventos', () => {
    const r = buildPartialClose({ trade: trade(), closedQuantity: 300, exitPremium: 0.5, exitDate: '2026-11-19' })
    expect(r.remainingRow).toMatchObject({
      id: 't1', quantity: 700, status: 'open', option_status: 'open', exit_price: null, exit_date: null,
      target_price: 0.9, stop_loss: 0.2, current_premium: 0.7,
      google_event_id: 'ev-due', google_reminder_event_id: 'ev-rem',
    })
  })
})

describe('buildPartialClose — lançador', () => {
  it('resultado = (entrada − saída) × quantidade − taxas', () => {
    const r = buildPartialClose({
      trade: trade({ position: 'writer', option_type: 'put', premium: 1.2, fees: 10 }),
      closedQuantity: 400, exitPremium: 0.5, exitDate: '2026-11-19',
    })
    // taxas da parte: 10 × 400/1000 = 4
    expect(r.closedRow.fees).toBe(4)
    expect(r.resultado).toBeCloseTo((1.2 - 0.5) * 400 - 4, 6)
    expect(r.remainingRow?.fees).toBe(6)
    // put lançada: rentabilidade sobre a exposição (400 × 38)
    expect(r.rentabilidade).toBeCloseTo((r.resultado / (400 * 38)) * 100, 6)
  })

  it('call lançada: sem base de rentabilidade', () => {
    const r = buildPartialClose({
      trade: trade({ position: 'writer', option_type: 'call', premium: 1 }),
      closedQuantity: 100, exitPremium: 1.5, exitDate: '2026-11-19',
    })
    expect(r.resultado).toBeCloseTo(-50, 6)
    expect(r.rentabilidade).toBeNull()
  })
})

describe('buildPartialClose — quantidade total', () => {
  it('cai no fluxo atual: sem linha restante, mesma operação encerrada', () => {
    const t = trade({ fees: 12.34 })
    const r = buildPartialClose({ trade: t, closedQuantity: 1000, exitPremium: 0.8, exitDate: '2026-11-19' })
    expect(r.remainingRow).toBeNull()
    expect(r.closedRow.quantity).toBe(1000)
    expect(r.closedRow.fees).toBe(12.34)
    expect(r.resultado).toBeCloseTo((0.8 - 0.32) * 1000 - 12.34, 6)
  })
})

describe('buildPartialClose — erros', () => {
  const base = { exitPremium: 0.8, exitDate: '2026-11-19' }
  it('quantidade 0', () => {
    expect(() => buildPartialClose({ trade: trade(), closedQuantity: 0, ...base })).toThrow()
  })
  it('quantidade maior que o total', () => {
    expect(() => buildPartialClose({ trade: trade(), closedQuantity: 1001, ...base })).toThrow(/1000/)
  })
  it('quantidade fracionária', () => {
    expect(() => buildPartialClose({ trade: trade(), closedQuantity: 10.5, ...base })).toThrow()
  })
})

describe('splitFees', () => {
  it.each([
    [10, 1, 3],
    [10, 2, 3],
    [0.01, 1, 2],
    [7.77, 333, 1000],
    [12.35, 500, 1000],
    [99.99, 1, 7],
    [0.1, 1, 3],
  ])('taxas %s, encerra %s de %s: a soma das partes é igual à original', (fees, closed, total) => {
    const s = splitFees(fees, closed, total)
    expect(cents(s.closed + s.remaining)).toBe(cents(fees))
    expect(cents(s.closed)).toBe(Math.round((fees * closed / total) * 100))
  })

  it('arredonda a parte encerrada e deixa o resto na aberta', () => {
    expect(splitFees(10, 1, 3)).toEqual({ closed: 3.33, remaining: 6.67 })
  })
})

describe('taxa de saída', () => {
  it('é opcional: sem ela, a encerrada leva só a parte proporcional da entrada', () => {
    const r = buildPartialClose({ trade: trade({ fees: 10 }), closedQuantity: 500, exitPremium: 0.8, exitDate: '2026-11-19' })
    expect(r.closedRow.fees).toBe(5)
  })

  it('é somada às taxas da encerrada e não altera a aberta', () => {
    const r = buildPartialClose({
      trade: trade({ fees: 10 }), closedQuantity: 500, exitPremium: 0.8, exitDate: '2026-11-19', exitFees: 4.9,
    })
    expect(r.closedRow.fees).toBe(9.9)
    expect(r.remainingRow?.fees).toBe(5)
    expect(r.resultado).toBeCloseTo(240 - 9.9, 6)
  })

  it('negativa é erro', () => {
    expect(() => buildPartialClose({
      trade: trade(), closedQuantity: 500, exitPremium: 0.8, exitDate: '2026-11-19', exitFees: -1,
    })).toThrow()
  })
})

describe('validateClosedQuantity', () => {
  it('avisa, sem bloquear, quando não é múltiplo de 100', () => {
    expect(validateClosedQuantity(150, 1000)).toEqual({ error: null, warning: LOT_WARNING })
    expect(validateClosedQuantity(200, 1000)).toEqual({ error: null, warning: null })
  })
})

describe('integração com totais, Dashboard e avisos de vencimento', () => {
  it('a parte encerrada entra no realizado do mês da saída; a aberta segue no parcial e no aviso', async () => {
    const { summarizeOptionsPeriod } = await import('./period-summary')
    const { getOptionExpiryNotices } = await import('./calc')
    const original = trade({ fees: 10 })
    const r = buildPartialClose({ trade: original, closedQuantity: 500, exitPremium: 0.8, exitDate: '2026-11-19' })
    const closed: TradeOperation = { ...r.closedRow, id: 't2', created_at: '', updated_at: '' }
    const trades = [r.remainingRow!, closed]

    const nov = summarizeOptionsPeriod(trades, '2026-11-01', '2026-11-30')
    expect(nov.realizedResult).toBeCloseTo(240 - 5, 6)
    expect(nov.closedCount).toBe(1)
    expect(nov.openCount).toBe(1)
    // parcial: 500 abertas com prêmio atual 0,70 e taxas restantes de 5
    expect(nov.partial.result).toBeCloseTo((0.7 - 0.32) * 500 - 5, 6)

    const dec = summarizeOptionsPeriod(trades, '2026-12-01', '2026-12-31')
    expect(dec.realizedResult).toBe(0)

    const notices = getOptionExpiryNotices(trades, '2026-12-15')
    expect(notices.map((n) => n.id)).toEqual(['t1'])
  })
})
