import { describe, it, expect } from 'vitest'
import { resolveVisibleTradeTypes } from './visible-trade-types'

const both = { swing: true, options: true, types: ['swing', 'options'] }

describe('resolveVisibleTradeTypes', () => {
  it('padrão: os dois visíveis, inclusive sem preferência gravada', () => {
    expect(resolveVisibleTradeTypes(null)).toEqual(both)
    expect(resolveVisibleTradeTypes(undefined)).toEqual(both)
    expect(resolveVisibleTradeTypes({})).toEqual(both)
    expect(resolveVisibleTradeTypes({ show_swing_trades: null, show_option_trades: null })).toEqual(both)
    expect(resolveVisibleTradeTypes({ show_swing_trades: true, show_option_trades: true })).toEqual(both)
  })

  it('só Opções', () => {
    expect(resolveVisibleTradeTypes({ show_swing_trades: false, show_option_trades: true }))
      .toEqual({ swing: false, options: true, types: ['options'] })
  })

  it('só Swing', () => {
    expect(resolveVisibleTradeTypes({ show_swing_trades: true, show_option_trades: false }))
      .toEqual({ swing: true, options: false, types: ['swing'] })
  })

  it('proteção: as duas desligadas mostram as duas', () => {
    expect(resolveVisibleTradeTypes({ show_swing_trades: false, show_option_trades: false })).toEqual(both)
  })
})
