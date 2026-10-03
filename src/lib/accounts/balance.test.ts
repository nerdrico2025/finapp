import { describe, it, expect } from 'vitest'
import { computeTotalBalance, groupAccountsBySection } from './balance'

const acc = (type: 'checking' | 'savings' | 'credit_card' | 'investment' | 'wallet' | 'other', balance: number, include_in_total = true) =>
  ({ type, balance, include_in_total })

describe('computeTotalBalance', () => {
  it('soma corrente, poupança, cartão e carteira; nunca investimentos nem outras', () => {
    expect(computeTotalBalance([
      acc('checking', 1000),
      acc('savings', 500),
      acc('credit_card', -300),
      acc('wallet', 50),
      acc('investment', 10_000),
      acc('other', 999),
    ])).toBe(1250)
  })

  it('respeita include_in_total, inclusive para investimentos (que já ficam fora)', () => {
    expect(computeTotalBalance([acc('checking', 1000, false), acc('wallet', 20), acc('investment', 5, true)])).toBe(20)
  })
})

describe('groupAccountsBySection', () => {
  it('ordena as seções, omite as vazias e marca as que ficam fora do total', () => {
    const sections = groupAccountsBySection([
      acc('investment', 100), acc('savings', 10), acc('checking', 5), acc('other', 1),
    ])
    expect(sections.map(s => [s.title, s.accounts.length, s.subtotal, s.inTotal])).toEqual([
      ['Contas correntes', 2, 15, true],
      ['Investimentos', 1, 100, false],
      ['Outras', 1, 1, false],
    ])
  })
})
