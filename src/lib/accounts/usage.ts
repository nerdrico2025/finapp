/**
 * Movimentação de uma conta, usada para decidir entre excluir e inativar.
 *   transactions      — linhas com account_id = conta (inclui espelhos de
 *                       transferências recebidas)
 *   incomingTransfers — transferências principais de outras contas com
 *                       destination_account_id = conta
 *   otherReferences   — demais linhas que citam a conta como destino (espelhos
 *                       de transferências que ela enviou). Normalmente a
 *                       principal já está em `transactions`; só pesa se o
 *                       dado estiver inconsistente.
 */
export interface AccountUsage {
  transactions: number
  incomingTransfers: number
  otherReferences: number
}

export function hasMovement(u: AccountUsage): boolean {
  return u.transactions + u.incomingTransfers + u.otherReferences > 0
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/** Mensagem de bloqueio da exclusão, com as quantidades; null se pode excluir. */
export function deletionBlockMessage(accountName: string, u: AccountUsage): string | null {
  if (!hasMovement(u)) return null
  const incoming = u.incomingTransfers || (u.transactions === 0 ? u.otherReferences : 0)
  const parts = [
    u.transactions > 0 ? plural(u.transactions, 'transação', 'transações') : null,
    incoming > 0 ? plural(incoming, 'transferência recebida de outra conta', 'transferências recebidas de outras contas') : null,
  ].filter(Boolean)
  return `Não é possível excluir "${accountName}": ela tem ${parts.join(' e ')}. ` +
    'Inative a conta para tirá-la das listas sem perder o histórico.'
}

export interface AccountOption {
  id: string
  name: string
  inactive: boolean
}

/**
 * Opções de um select de conta: as contas ativas e, se faltarem, as contas
 * que o registro em edição já usa (inativas) — senão o select perde o valor e
 * a transação acabaria salva em outra conta.
 */
export function accountOptions(
  active: { id: string; name: string }[],
  current: ({ id: string; name: string } | null | undefined)[],
): AccountOption[] {
  const options: AccountOption[] = active.map(a => ({ id: a.id, name: a.name, inactive: false }))
  for (const c of current) {
    if (c && !options.some(o => o.id === c.id)) options.push({ id: c.id, name: c.name, inactive: true })
  }
  return options
}
