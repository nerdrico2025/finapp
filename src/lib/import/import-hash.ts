import { createHash } from 'crypto'

/**
 * Hash de deduplicação da importação. Não inclui a conta: duas linhas com
 * mesmo valor, data e descrição em contas diferentes geram o mesmo hash.
 */
export function generateImportHash(userId: string, amount: number, date: string, description: string): string {
  return createHash('md5')
    .update(`${userId}|${amount}|${date}|${(description ?? '').toLowerCase().trim()}`)
    .digest('hex')
}
