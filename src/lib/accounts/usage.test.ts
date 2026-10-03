import { describe, it, expect } from 'vitest'
import { accountOptions, deletionBlockMessage, hasMovement } from './usage'

describe('deletionBlockMessage', () => {
  it('sem movimentação: pode excluir', () => {
    const u = { transactions: 0, incomingTransfers: 0, otherReferences: 0 }
    expect(hasMovement(u)).toBe(false)
    expect(deletionBlockMessage('Nubank', u)).toBeNull()
  })

  it('com transações e transferências recebidas: bloqueia com as quantidades', () => {
    expect(deletionBlockMessage('Nubank', { transactions: 12, incomingTransfers: 3, otherReferences: 0 }))
      .toBe('Não é possível excluir "Nubank": ela tem 12 transações e 3 transferências recebidas de outras contas. ' +
        'Inative a conta para tirá-la das listas sem perder o histórico.')
  })

  it('só como destino de transferência também bloqueia', () => {
    expect(deletionBlockMessage('BTG', { transactions: 0, incomingTransfers: 1, otherReferences: 0 }))
      .toContain('1 transferência recebida de outra conta')
  })
})

describe('accountOptions', () => {
  it('inclui a conta atual da transação mesmo inativa, sem duplicar as ativas', () => {
    const opts = accountOptions(
      [{ id: 'a', name: 'Itaú' }],
      [{ id: 'a', name: 'Itaú' }, { id: 'x', name: 'Conta antiga' }, null],
    )
    expect(opts).toEqual([
      { id: 'a', name: 'Itaú', inactive: false },
      { id: 'x', name: 'Conta antiga', inactive: true },
    ])
  })
})
