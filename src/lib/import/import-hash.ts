import { createHash } from 'crypto'

/**
 * Hash de deduplicação da importação. Não inclui a conta: duas linhas com
 * mesmo valor, data e descrição em contas diferentes geram o mesmo hash.
 *
 * `salt` só é usado pelo perfil Sicredi (o id do lançamento no banco): sem
 * ele, dois lançamentos legítimos idênticos no mesmo dia teriam o mesmo hash
 * e o segundo seria descartado como duplicata. Sem sal, o hash é exatamente o
 * de sempre — OFX, XLSX, PDF, CSV genérico e lançamento manual não mudam.
 */
export function generateImportHash(
  userId: string,
  amount: number,
  date: string,
  description: string,
  salt?: string | null,
): string {
  const base = `${userId}|${amount}|${date}|${(description ?? '').toLowerCase().trim()}`
  return createHash('md5')
    .update(salt ? `${base}|${salt}` : base)
    .digest('hex')
}
