import { describe, it, expect } from 'vitest'
import {
  computeOption, validateOption, summarizeOptions, getOptionExpiryNotices,
  parseDecimal, todayInBrazil, LOT_WARNING, type OptionInput,
} from './calc'

const base = (over: Partial<OptionInput> = {}): OptionInput => ({
  optionType: 'call',
  position: 'holder',
  quantity: 1000,
  strike: 30,
  premium: 0.32,
  fees: 0,
  status: 'open',
  exitPremium: null,
  currentPremium: null,
  underlyingPriceAtExercise: null,
  ...over,
})

describe('computeOption: entrada', () => {
  it('caso real: titular de call, 1.000 × 0,32 = 320,00, sem multiplicar por 100', () => {
    const c = computeOption(base())
    expect(c.premiumTotal).toBeCloseTo(320)
    expect(c.paid).toBeCloseTo(320)
    expect(c.maxLoss).toBeCloseTo(320)
    expect(c.received).toBeNull()
    expect(c.exposure).toBeNull()
    expect(c.result).toBeNull()
  })

  it('titular: desembolso e perda máxima incluem as taxas', () => {
    const c = computeOption(base({ fees: 5 }))
    expect(c.paid).toBeCloseTo(325)
    expect(c.maxLoss).toBeCloseTo(325)
  })

  it('break-even: call = strike + prêmio; put = strike − prêmio', () => {
    expect(computeOption(base()).breakEven).toBeCloseTo(30.32)
    expect(computeOption(base({ optionType: 'put' })).breakEven).toBeCloseTo(29.68)
    expect(computeOption(base({ position: 'writer' })).breakEven).toBeNull()
  })

  it('put lançada: recebe prêmio líquido e tem exposição quantidade × strike', () => {
    const c = computeOption(base({ optionType: 'put', position: 'writer', fees: 5 }))
    expect(c.received).toBeCloseTo(315)
    expect(c.exposure).toBeCloseTo(30000)
    expect(c.paid).toBeNull()
  })

  it('call lançada: recebe prêmio, sem exposição financeira calculada', () => {
    const c = computeOption(base({ position: 'writer' }))
    expect(c.received).toBeCloseTo(320)
    expect(c.exposure).toBeNull()
  })
})

describe('computeOption: closed', () => {
  it('titular = (saída − entrada) × qtd − taxas', () => {
    const c = computeOption(base({ status: 'closed', exitPremium: 0.5, fees: 5 }))
    expect(c.result).toBeCloseTo(175)
    expect(c.resultKind).toBe('realized')
    expect(c.returnPct).toBeCloseTo((175 / 325) * 100)
  })

  it('lançador = (entrada − saída) × qtd − taxas', () => {
    const c = computeOption(base({ position: 'writer', status: 'closed', exitPremium: 0.1, fees: 5 }))
    expect(c.result).toBeCloseTo(215)
  })

  it('sem prêmio de saída não há resultado', () => {
    expect(computeOption(base({ status: 'closed' })).result).toBeNull()
  })
})

describe('computeOption: expired', () => {
  it('titular perde prêmio e taxas', () => {
    expect(computeOption(base({ status: 'expired', fees: 5 })).result).toBeCloseTo(-325)
  })

  it('lançador fica com o prêmio menos taxas', () => {
    expect(computeOption(base({ position: 'writer', status: 'expired', fees: 5 })).result).toBeCloseTo(315)
  })
})

describe('computeOption: exercised', () => {
  const ex = { status: 'exercised' as const, underlyingPriceAtExercise: 32, fees: 5 }

  it('titular de call = (ação − strike − prêmio) × qtd − taxas', () => {
    expect(computeOption(base(ex)).result).toBeCloseTo(1675)
  })

  it('titular de put = (strike − ação − prêmio) × qtd − taxas', () => {
    const c = computeOption(base({ ...ex, optionType: 'put', underlyingPriceAtExercise: 28 }))
    expect(c.result).toBeCloseTo(1675)
  })

  it('lançador de call = inverso do titular, descontando só as próprias taxas', () => {
    expect(computeOption(base({ ...ex, position: 'writer' })).result).toBeCloseTo(-1685)
  })

  it('lançador de put = inverso do titular, com rentabilidade sobre exposição', () => {
    const c = computeOption(base({ ...ex, position: 'writer', optionType: 'put', underlyingPriceAtExercise: 28 }))
    expect(c.result).toBeCloseTo(-1685)
    expect(c.returnBasis).toBe('exposure')
    expect(c.returnPct).toBeCloseTo((-1685 / 30000) * 100)
  })

  it('sem preço da ação não há resultado', () => {
    expect(computeOption(base({ status: 'exercised' })).result).toBeNull()
  })
})

describe('computeOption: open', () => {
  it('com prêmio atual, resultado é não realizado pela fórmula de closed', () => {
    const c = computeOption(base({ currentPremium: 0.5, fees: 5 }))
    expect(c.result).toBeCloseTo(175)
    expect(c.resultKind).toBe('unrealized')
  })

  it('lançador de call não tem rentabilidade', () => {
    const c = computeOption(base({ position: 'writer', currentPremium: 0.1 }))
    expect(c.result).toBeCloseTo(220)
    expect(c.returnPct).toBeNull()
    expect(c.returnBasis).toBeNull()
  })
})

describe('validateOption', () => {
  it('bloqueia strike, prêmio ou quantidade ≤ 0', () => {
    const { errors } = validateOption({ quantity: 0, strike: null, premium: -1 })
    expect(errors.map((e) => e.field)).toEqual(['quantity', 'strike', 'premium'])
    expect(validateOption({ quantity: 100, strike: 0, premium: 1 }).errors).toHaveLength(1)
  })

  it('avisa, sem bloquear, quando a quantidade não é múltipla de 100', () => {
    const r = validateOption({ quantity: 150, strike: 30, premium: 0.32 })
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([LOT_WARNING])
  })

  it('não avisa em lote cheio', () => {
    expect(validateOption({ quantity: 1000, strike: 30, premium: 0.32 }).warnings).toEqual([])
  })
})

describe('summarizeOptions', () => {
  it('separa capital pago, prêmio recebido, exposição aberta e resultados', () => {
    const s = summarizeOptions([
      base({ fees: 5 }),
      base({ position: 'writer', optionType: 'put', fees: 5 }),
      base({ position: 'writer', optionType: 'put', status: 'expired' }),
      base({ currentPremium: 0.5 }),
    ])
    expect(s.paid).toBeCloseTo(645)
    expect(s.received).toBeCloseTo(635)
    expect(s.openExposure).toBeCloseTo(30000)
    expect(s.realizedResult).toBeCloseTo(320)
    expect(s.unrealizedResult).toBeCloseTo(180)
  })
})

describe('getOptionExpiryNotices', () => {
  const t = (id: string, expiration_date: string | null, option_status: 'open' | 'closed' = 'open') =>
    ({ id, ticker: 'PETR4', option_series: `S${id}`, option_status, expiration_date })

  it('inclui de D-7 em diante, inclusive vencidas ainda abertas, mais urgente primeiro', () => {
    const notices = getOptionExpiryNotices(
      [t('d8', '2026-11-08'), t('d7', '2026-11-07'), t('d0', '2026-10-31'), t('late', '2026-10-20')],
      '2026-10-31',
    )
    expect(notices.map((n) => n.id)).toEqual(['late', 'd0', 'd7'])
    expect(notices[2]!.message).toBe('Vencimento de Sd7: o que aconteceu? Encerre a operação.')
  })

  it('ignora encerradas e sem vencimento', () => {
    expect(getOptionExpiryNotices([t('a', '2026-10-31', 'closed'), t('b', null)], '2026-10-31')).toEqual([])
  })
})

describe('parseDecimal', () => {
  it.each([
    ['1.000', 1000], ['1000', 1000], ['1.000,50', 1000.5], ['0,32', 0.32],
    ['0.32', 0.32], ['12.5', 12.5], ['', 0],
  ])('%s → %d', (raw, expected) => {
    expect(parseDecimal(raw)).toBeCloseTo(expected)
  })
})

describe('todayInBrazil', () => {
  it('usa o fuso de São Paulo na virada do dia UTC', () => {
    expect(todayInBrazil(new Date('2026-10-31T01:00:00Z'))).toBe('2026-10-30')
  })
})
