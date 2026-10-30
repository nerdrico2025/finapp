import { describe, it, expect } from 'vitest'
import { realizedLabel, summarizeRealized } from './realized-summary'

const op = (resultado: number | null, rentPct: number | null = null, resultKind: 'realized' | 'unrealized' | null = 'realized') =>
  ({ resultado, rentPct, resultKind })

describe('summarizeRealized', () => {
  it('sem encerradas: taxa de acerto e rentabilidade ficam nulas, não zero', () => {
    const s = summarizeRealized([])
    expect(s.winRate).toBeNull()
    expect(s.avgRent).toBeNull()
    expect(s.netResult).toBe(0)
  })

  it('só abertas, com ou sem parcial, também dão nulo', () => {
    const s = summarizeRealized([op(180, 50, 'unrealized'), op(null, null, null)])
    expect(s.winRate).toBeNull()
    expect(s.avgRent).toBeNull()
    expect(s.totalProfit).toBe(0)
  })

  it('separa lucro e prejuízo e calcula taxa de acerto e rentabilidade média', () => {
    const s = summarizeRealized([op(100, 10), op(-40, -20), op(60, 40), op(0, 0)])
    expect(s.totalProfit).toBe(160)
    expect(s.totalLoss).toBe(-40)
    expect(s.netResult).toBe(120)
    expect(s.winRate).toBe(50)
    expect(s.avgRent).toBe(7.5)
  })

  it('todas perdedoras: 0% é um resultado real, diferente de nulo', () => {
    expect(summarizeRealized([op(-10, -5)]).winRate).toBe(0)
  })

  it('swing sem resultKind conta como realizado', () => {
    expect(summarizeRealized([{ resultado: 50, rentPct: 5 }]).netResult).toBe(50)
  })
})

describe('realizedLabel', () => {
  it('ajusta o texto aos tipos visíveis', () => {
    expect(realizedLabel({ swing: true, options: true })).toBe('Resultado realizado · Swing Trade + Opções (encerradas)')
    expect(realizedLabel({ swing: false, options: true })).toBe('Resultado realizado · Opções (encerradas)')
    expect(realizedLabel({ swing: true, options: false })).toBe('Resultado realizado · Swing Trade (encerradas)')
  })
})
