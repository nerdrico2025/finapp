import type { AccountType } from '@/types'

/**
 * Regra única do "Saldo total", usada na tela de Contas e no Dashboard (via
 * getTotalBalance): soma contas correntes, poupanças, cartões de crédito e
 * dinheiro/carteiras ativas e com include_in_total ligado. Investimentos,
 * "outras" e contas inativas nunca entram. Cartão com fatura em aberto tem
 * saldo negativo e reduz o total.
 */
export const TOTAL_BALANCE_TYPES: readonly AccountType[] = ['checking', 'savings', 'credit_card', 'wallet']

type BalanceAccount = { type: AccountType; balance: number | null; include_in_total: boolean; is_active?: boolean }

export function countsInTotalBalance(a: Pick<BalanceAccount, 'type' | 'include_in_total' | 'is_active'>): boolean {
  return a.is_active !== false && a.include_in_total && TOTAL_BALANCE_TYPES.includes(a.type)
}

export function computeTotalBalance(accounts: BalanceAccount[]): number {
  return accounts.filter(countsInTotalBalance).reduce((sum, a) => sum + Number(a.balance ?? 0), 0)
}

export interface AccountSection<T> {
  key: string
  title: string
  /** false → a seção mostra o selo "Fora do saldo total". */
  inTotal: boolean
  accounts: T[]
  subtotal: number
}

const SECTIONS: { key: string; title: string; types: AccountType[] }[] = [
  { key: 'checking', title: 'Contas correntes', types: ['checking', 'savings'] },
  { key: 'credit_card', title: 'Cartões de crédito', types: ['credit_card'] },
  { key: 'wallet', title: 'Dinheiro/carteiras', types: ['wallet'] },
  { key: 'investment', title: 'Investimentos', types: ['investment'] },
  { key: 'other', title: 'Outras', types: ['other'] },
]

/** Agrupa as contas por seção, na ordem fixa, omitindo seções vazias. */
export function groupAccountsBySection<T extends BalanceAccount>(accounts: T[]): AccountSection<T>[] {
  return SECTIONS
    .map(s => {
      const list = accounts.filter(a => s.types.includes(a.type))
      return {
        key: s.key,
        title: s.title,
        inTotal: s.types.some(t => TOTAL_BALANCE_TYPES.includes(t)),
        accounts: list,
        subtotal: list.reduce((sum, a) => sum + Number(a.balance ?? 0), 0),
      }
    })
    .filter(s => s.accounts.length > 0)
}
