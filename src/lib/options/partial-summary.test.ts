import { describe, it, expect } from 'vitest'
import { summarizeOptions, optionInputFromTrade } from './calc'
import { buildTradesView, summarizePartial } from './partial-summary'
import type { TradeOperation } from '@/types'

const trade = (over: Partial<TradeOperation> = {}) => ({
  option_type: 'call',
  position: 'holder',
  quantity: 1000,
  strike: 30,
  premium: 0.32,
  fees: 0,
  option_status: 'open',
  exit_price: null,
  current_premium: null,
  current_premium_updated_at: null,
  underlying_price_at_exercise: null,
  ...over,
}) as TradeOperation

const priced = (currentPremium: number, updatedAt: string) =>
  trade({ current_premium: currentPremium, current_premium_updated_at: updatedAt })

describe('summarizePartial', () => {
  it('sem operações: tudo zerado e sem data', () => {
    expect(summarizePartial([])).toEqual({
      result: 0, includedCount: 0, missingPremiumCount: 0, oldestUpdatedAt: null,
    })
  })

  it('conta só as abertas com prêmio atual e soma o resultado delas', () => {
    const s = summarizePartial([
      priced(0.5, '2026-10-20T12:00:00Z'),
      priced(0.42, '2026-10-21T12:00:00Z'),
    ])
    expect(s.includedCount).toBe(2)
    expect(s.result).toBeCloseTo(280)
  })

  it('ignora encerradas, exercidas e que viraram pó, mesmo com prêmio atual', () => {
    const s = summarizePartial([
      trade({ option_status: 'closed', exit_price: 1, current_premium: 0.5, current_premium_updated_at: '2026-01-01T00:00:00Z' }),
      trade({ option_status: 'exercised', underlying_price_at_exercise: 32 }),
      trade({ option_status: 'expired' }),
    ])
    expect(s).toEqual({ result: 0, includedCount: 0, missingPremiumCount: 0, oldestUpdatedAt: null })
  })

  it('usa a data de atualização mais antiga, comparando instantes e não texto', () => {
    const s = summarizePartial([
      priced(0.5, '2026-10-22T00:30:00+00:00'),
      priced(0.5, '2026-10-21T23:00:00-03:00'),
      priced(0.5, '2026-10-25T12:00:00Z'),
    ])
    expect(s.oldestUpdatedAt).toBe('2026-10-22T00:30:00+00:00')
  })

  it('conta abertas sem prêmio atual, sem afetar resultado nem data', () => {
    const s = summarizePartial([trade(), trade(), priced(0.5, '2026-10-20T12:00:00Z')])
    expect(s.missingPremiumCount).toBe(2)
    expect(s.includedCount).toBe(1)
    expect(s.result).toBeCloseTo(180)
    expect(s.oldestUpdatedAt).toBe('2026-10-20T12:00:00Z')
  })

  it('prêmio atual zero é um preço válido, não "sem prêmio"', () => {
    const s = summarizePartial([priced(0, '2026-10-20T12:00:00Z')])
    expect(s.includedCount).toBe(1)
    expect(s.missingPremiumCount).toBe(0)
    expect(s.result).toBeCloseTo(-320)
  })
})

describe('buildTradesView', () => {
  const start = '2026-01-01'
  const end = '2026-10-30'
  const dated = (entry_date: string, over: Partial<TradeOperation> = {}) =>
    trade({ id: entry_date, type: 'options', entry_date, ...over })

  it('operação aberta com entrada fora do período entra no parcial, mas não nos realizados', () => {
    const outside = dated('2025-11-15', { current_premium: 0.5, current_premium_updated_at: '2026-10-20T12:00:00Z' })
    const inside = dated('2026-06-01', { option_status: 'expired' })
    const { periodTrades, partial } = buildTradesView([outside, inside], start, end)
    expect(periodTrades.map((t) => t.id)).toEqual(['2026-06-01'])
    expect(partial.includedCount).toBe(1)
    expect(partial.result).toBeCloseTo(180)
    expect(partial.oldestUpdatedAt).toBe('2026-10-20T12:00:00Z')
  })

  it('aberta sem prêmio atual fora do período também conta no aviso', () => {
    expect(buildTradesView([dated('2025-11-15')], start, end).partial.missingPremiumCount).toBe(1)
  })

  it('encerrada fora do período fica de fora dos dois', () => {
    const { periodTrades, partial } = buildTradesView(
      [dated('2025-11-15', { option_status: 'closed', exit_price: 1 })], start, end,
    )
    expect(periodTrades).toEqual([])
    expect(partial).toEqual({ result: 0, includedCount: 0, missingPremiumCount: 0, oldestUpdatedAt: null })
  })

  it('swing aberto não entra no parcial, mas segue o filtro de período', () => {
    const swing = dated('2026-06-01', { type: 'swing', option_status: null })
    const { periodTrades, partial } = buildTradesView([swing], start, end)
    expect(periodTrades).toHaveLength(1)
    expect(partial.missingPremiumCount).toBe(0)
  })

  it('aberta fora do período aparece na lista, marcada, e entra na exposição', () => {
    const outside = dated('2025-11-15', { position: 'writer', option_type: 'put' })
    const { optionsList, openExposure, outOfPeriodOpenIds } = buildTradesView([outside], start, end)
    expect(optionsList.map((t) => t.id)).toEqual(['2025-11-15'])
    expect(openExposure).toBeCloseTo(30000)
    expect(outOfPeriodOpenIds.has('2025-11-15')).toBe(true)
  })

  it('aberta dentro do período aparece na lista sem marca', () => {
    const { optionsList, outOfPeriodOpenIds } = buildTradesView([dated('2026-06-01')], start, end)
    expect(optionsList).toHaveLength(1)
    expect(outOfPeriodOpenIds.size).toBe(0)
  })

  it('encerrada fora do período não aparece na lista nem na exposição; dentro aparece', () => {
    const put = { position: 'writer', option_type: 'put' } as const
    const { optionsList, openExposure } = buildTradesView([
      dated('2025-11-15', { ...put, option_status: 'closed', exit_price: 0.1 }),
      dated('2026-06-01', { ...put, option_status: 'expired' }),
    ], start, end)
    expect(optionsList.map((t) => t.id)).toEqual(['2026-06-01'])
    expect(openExposure).toBe(0)
  })

  it('swing não entra na lista de opções', () => {
    expect(buildTradesView([dated('2026-06-01', { type: 'swing', option_status: null })], start, end).optionsList).toEqual([])
  })

  it('capital pago e prêmio recebido seguem o período, mesmo com aberta fora dele', () => {
    const { periodTrades } = buildTradesView([
      dated('2025-11-15'),
      dated('2025-11-16', { position: 'writer' }),
      dated('2026-06-01'),
      dated('2026-06-02', { position: 'writer' }),
    ], start, end)
    const s = summarizeOptions(periodTrades.map(optionInputFromTrade))
    expect(s.paid).toBeCloseTo(320)
    expect(s.received).toBeCloseTo(320)
  })

  it('período personalizado sem datas mantém todas as operações', () => {
    expect(buildTradesView([dated('2025-11-15')], '', '').periodTrades).toHaveLength(1)
  })
})
