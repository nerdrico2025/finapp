export type TradeType = 'swing' | 'options'

export interface VisibleTradeTypes {
  swing: boolean
  options: boolean
  types: TradeType[]
}

/**
 * Ausente vale como ligado. As duas desligadas não deveriam existir (o banco
 * tem CHECK), mas, se chegarem aqui, mostram tudo em vez de uma tela vazia.
 */
export function resolveVisibleTradeTypes(prefs: {
  show_swing_trades?: boolean | null
  show_option_trades?: boolean | null
} | null | undefined): VisibleTradeTypes {
  const swing = prefs?.show_swing_trades ?? true
  const options = prefs?.show_option_trades ?? true
  if (!swing && !options) return { swing: true, options: true, types: ['swing', 'options'] }
  return {
    swing,
    options,
    types: [...(swing ? ['swing' as const] : []), ...(options ? ['options' as const] : [])],
  }
}
