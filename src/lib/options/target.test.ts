import { describe, it, expect } from 'vitest'
import {
  computeTarget, getOptionTargetNotices, validateTarget,
  NEAR_TARGET_THRESHOLD_PCT, type TargetInput,
} from './target'
import type { TradeOperation } from '@/types'

const holder = (over: Partial<TargetInput> = {}): TargetInput => ({
  optionType: 'call',
  position: 'holder',
  strike: 30,
  premium: 0.32,
  currentPremium: null,
  targetPremium: 2.5,
  stopPremium: null,
  quantity: 1000,
  fees: 0,
  currentPremiumUpdatedAt: null,
  today: '2026-10-30',
  ...over,
})

const writer = (over: Partial<TargetInput> = {}) =>
  holder({ position: 'writer', optionType: 'put', premium: 1, targetPremium: 0.2, ...over })

describe('computeTarget: projeção', () => {
  it('caso real: titular, 0,32 → 2,50, 1.000 opções = R$ 2.180,00 e +681,25%', () => {
    const c = computeTarget(holder())
    expect(c.projectedResultAtTarget).toBeCloseTo(2180)
    expect(c.projectedReturnPctAtTarget).toBeCloseTo(681.25)
  })

  it('titular: desconta taxas do resultado e soma ao capital da rentabilidade', () => {
    const c = computeTarget(holder({ fees: 80 }))
    expect(c.projectedResultAtTarget).toBeCloseTo(2100)
    expect(c.projectedReturnPctAtTarget).toBeCloseTo(525)
  })

  it('lançador de put: rentabilidade sobre exposição', () => {
    const c = computeTarget(writer())
    expect(c.projectedResultAtTarget).toBeCloseTo(800)
    expect(c.projectedReturnPctAtTarget).toBeCloseTo((800 / 30000) * 100)
  })

  it('lançador de call: sem rentabilidade projetada', () => {
    const c = computeTarget(writer({ optionType: 'call' }))
    expect(c.projectedResultAtTarget).toBeCloseTo(800)
    expect(c.projectedReturnPctAtTarget).toBeNull()
  })

  it('sem alvo: sem projeção', () => {
    const c = computeTarget(holder({ targetPremium: null }))
    expect(c.projectedResultAtTarget).toBeNull()
    expect(c.projectedReturnPctAtTarget).toBeNull()
  })
})

describe('computeTarget: progresso e status', () => {
  it('sem prêmio atual: none, mas mantém a projeção', () => {
    const c = computeTarget(holder())
    expect(c.status).toBe('none')
    expect(c.progressPct).toBeNull()
    expect(c.projectedResultAtTarget).toBeCloseTo(2180)
  })

  it('sem alvo: none', () => {
    const c = computeTarget(holder({ targetPremium: null, currentPremium: 1 }))
    expect(c.status).toBe('none')
    expect(c.progressPct).toBeNull()
  })

  it('abaixo do limiar: progress', () => {
    const c = computeTarget(holder({ currentPremium: 1.41 }))
    expect(c.progressPct).toBeCloseTo(50)
    expect(c.status).toBe('progress')
  })

  it('80% exato: near', () => {
    const c = computeTarget(holder({ currentPremium: 0.32 + 0.8 * 2.18 }))
    expect(c.progressPct).toBe(NEAR_TARGET_THRESHOLD_PCT)
    expect(c.status).toBe('near')
  })

  it('logo abaixo de 80%: progress', () => {
    expect(computeTarget(holder({ currentPremium: 2.06 })).status).toBe('progress')
  })

  it('100% exato: reached', () => {
    const c = computeTarget(holder({ currentPremium: 2.5 }))
    expect(c.progressPct).toBe(100)
    expect(c.status).toBe('reached')
  })

  it('acima de 100%: reached, sem teto no progresso', () => {
    const c = computeTarget(holder({ currentPremium: 4.68 }))
    expect(c.progressPct).toBeCloseTo(200)
    expect(c.status).toBe('reached')
  })

  it('prêmio contra a posição: piso em 0%', () => {
    const c = computeTarget(holder({ currentPremium: 0.1 }))
    expect(c.progressPct).toBe(0)
    expect(c.status).toBe('progress')
  })

  it('lançador é o inverso: prêmio caindo avança', () => {
    expect(computeTarget(writer({ currentPremium: 0.6 })).progressPct).toBeCloseTo(50)
    expect(computeTarget(writer({ currentPremium: 0.36 })).status).toBe('near')
    expect(computeTarget(writer({ currentPremium: 0.2 })).status).toBe('reached')
    expect(computeTarget(writer({ currentPremium: 1.5 })).progressPct).toBe(0)
  })

  it('lançador aceita alvo zero (recomprar a custo nenhum)', () => {
    const c = computeTarget(writer({ targetPremium: 0, currentPremium: 0 }))
    expect(c.status).toBe('reached')
    expect(c.projectedResultAtTarget).toBeCloseTo(1000)
  })
})

describe('computeTarget: stop', () => {
  it('titular: atual ≤ stop', () => {
    expect(computeTarget(holder({ stopPremium: 0.2, currentPremium: 0.2 })).status).toBe('stop_reached')
    expect(computeTarget(holder({ stopPremium: 0.2, currentPremium: 0.1 })).status).toBe('stop_reached')
    expect(computeTarget(holder({ stopPremium: 0.2, currentPremium: 0.21 })).status).toBe('progress')
  })

  it('lançador: atual ≥ stop', () => {
    expect(computeTarget(writer({ stopPremium: 1.5, currentPremium: 1.5 })).status).toBe('stop_reached')
    expect(computeTarget(writer({ stopPremium: 1.5, currentPremium: 1.49 })).status).toBe('progress')
  })

  it('funciona sem alvo', () => {
    const c = computeTarget(holder({ targetPremium: null, stopPremium: 0.2, currentPremium: 0.1 }))
    expect(c.status).toBe('stop_reached')
    expect(c.progressPct).toBeNull()
  })

  it('sem prêmio atual não dispara', () => {
    expect(computeTarget(holder({ stopPremium: 0.2 })).status).toBe('none')
  })
})

describe('computeTarget: prêmio desatualizado', () => {
  it('3 dias ainda não é stale; 4 dias é', () => {
    const three = computeTarget(holder({ currentPremium: 1, currentPremiumUpdatedAt: '2026-10-27T15:00:00Z' }))
    expect(three.staleDays).toBe(3)
    expect(three.stale).toBe(false)
    const four = computeTarget(holder({ currentPremium: 1, currentPremiumUpdatedAt: '2026-10-26T15:00:00Z' }))
    expect(four.staleDays).toBe(4)
    expect(four.stale).toBe(true)
  })

  it('conta o dia pelo fuso de São Paulo', () => {
    const c = computeTarget(holder({ currentPremiumUpdatedAt: '2026-10-30T01:00:00Z' }))
    expect(c.staleDays).toBe(1)
  })

  it('sem data de atualização: não é stale', () => {
    const c = computeTarget(holder())
    expect(c.staleDays).toBeNull()
    expect(c.stale).toBe(false)
  })
})

describe('validateTarget', () => {
  const v = (position: 'holder' | 'writer', targetPremium: number | null, stopPremium: number | null) =>
    validateTarget({ position, premium: 1, targetPremium, stopPremium }).map((e) => e.field)

  it('titular: bloqueia alvo ≤ entrada e stop ≥ entrada', () => {
    expect(v('holder', 1, null)).toEqual(['target'])
    expect(v('holder', 0.5, null)).toEqual(['target'])
    expect(v('holder', null, 1)).toEqual(['stop'])
    expect(v('holder', 2, 0.5)).toEqual([])
  })

  it('lançador: bloqueia alvo ≥ entrada e stop ≤ entrada', () => {
    expect(v('writer', 1, null)).toEqual(['target'])
    expect(v('writer', null, 1)).toEqual(['stop'])
    expect(v('writer', null, 0.5)).toEqual(['stop'])
    expect(v('writer', 0.5, 2)).toEqual([])
  })

  it('campos vazios ou sem prêmio de entrada: sem erro', () => {
    expect(v('holder', null, null)).toEqual([])
    expect(validateTarget({ position: 'writer', premium: 0, targetPremium: 1, stopPremium: null })).toEqual([])
  })
})

describe('getOptionTargetNotices', () => {
  const today = '2026-10-30'
  const trade = (id: string, over: Partial<TradeOperation> = {}) => ({
    id,
    type: 'options',
    ticker: 'PETR4',
    option_series: `S${id}`,
    option_type: 'call',
    option_status: 'open',
    position: 'holder',
    strike: 30,
    premium: 0.32,
    quantity: 1000,
    fees: 0,
    target_price: 2.5,
    stop_loss: 0.1,
    current_premium: null,
    current_premium_updated_at: '2026-10-30T12:00:00Z',
    ...over,
  }) as TradeOperation
  const ids = (trades: TradeOperation[]) => getOptionTargetNotices(trades, today).map((n) => n.id)
  const text = (s: string) => s.replace(/ /g, ' ')

  it('inclui near, reached e stop, com o stop primeiro', () => {
    expect(ids([
      trade('near', { current_premium: 2.1 }),
      trade('reached', { current_premium: 2.5 }),
      trade('stop', { current_premium: 0.1 }),
    ])).toEqual(['stop', 'reached', 'near'])
  })

  it('ignora progress, sem prêmio atual e sem alvo nem stop', () => {
    expect(ids([
      trade('progress', { current_premium: 1 }),
      trade('none'),
      trade('sem-alvo', { current_premium: 2.5, target_price: null, stop_loss: null }),
    ])).toEqual([])
  })

  it('ignora encerradas e swing', () => {
    expect(ids([
      trade('closed', { current_premium: 2.5, option_status: 'closed' }),
      trade('swing', { current_premium: 2.5, type: 'swing' }),
    ])).toEqual([])
  })

  it('texto do alvo', () => {
    const [n] = getOptionTargetNotices([trade('1', { current_premium: 2.1 })], today)
    expect(text(n!.message)).toBe('S1: prêmio atual R$ 2,10, 81% do caminho até o alvo R$ 2,50')
  })

  it('texto do stop não fala em caminho até o alvo', () => {
    const [n] = getOptionTargetNotices([trade('1', { current_premium: 0.1 })], today)
    expect(text(n!.message)).toBe('S1: prêmio atual R$ 0,10, stop de R$ 0,10 atingido')
  })

  it('prêmio desatualizado acrescenta o aviso ao texto', () => {
    const stale = { current_premium_updated_at: '2026-10-25T15:00:00Z' }
    const [alvo] = getOptionTargetNotices([trade('1', { current_premium: 2.1, ...stale })], today)
    expect(text(alvo!.message)).toBe('S1: prêmio atual R$ 2,10, 81% do caminho até o alvo R$ 2,50 · prêmio atualizado há 5 dias')
    const [stop] = getOptionTargetNotices([trade('2', { current_premium: 0.1, ...stale })], today)
    expect(text(stop!.message)).toBe('S2: prêmio atual R$ 0,10, stop de R$ 0,10 atingido · prêmio atualizado há 5 dias')
  })

  it('prêmio com 3 dias não acrescenta o aviso', () => {
    const [n] = getOptionTargetNotices([trade('1', { current_premium: 2.1, current_premium_updated_at: '2026-10-27T15:00:00Z' })], today)
    expect(n!.message).not.toContain('prêmio atualizado há')
  })

  it('trunca o percentual: 99,5% não vira 100%', () => {
    const [n] = getOptionTargetNotices([trade('1', { current_premium: 2.49 })], today)
    expect(n!.status).toBe('near')
    expect(text(n!.message)).toContain('99% do caminho')
  })
})
