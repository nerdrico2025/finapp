/**
 * Camada 1 de deduplicação na prévia: linhas cujo id do banco
 * (bankTransactionId) já existe para o usuário são puladas sem aparecer na
 * pré-visualização. Vale para qualquer formato que traga o id (OFX, Sicredi).
 */

export function collectBankIds(rows: { bankTransactionId?: string | null }[]): string[] {
  return Array.from(new Set(rows.map(r => r.bankTransactionId).filter((id): id is string => !!id)))
}

export function dropKnownBankIds<T extends { bankTransactionId?: string | null }>(
  rows: T[],
  known: Set<string>,
): { rows: T[]; skipped: number } {
  const kept = rows.filter(r => !(r.bankTransactionId && known.has(r.bankTransactionId)))
  return { rows: kept, skipped: rows.length - kept.length }
}
