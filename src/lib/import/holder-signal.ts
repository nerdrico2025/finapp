/**
 * Sinal "titular": a descrição cita o nome completo do próprio usuário (PIX
 * entre contas dele em bancos diferentes). Diferente dos sinais A/B de
 * transfer-detection, não diz qual é a outra conta — só que é transferência;
 * a conta destino é escolhida pelo usuário na prévia.
 *
 * Fonte do nome: profiles.full_name (Configurações › Perfil). O projeto não
 * guarda CPF do titular; se um dia guardar, `cpf` casa como sequência de
 * dígitos inteira.
 */

import { normalizeText } from './transfer-detection'

export interface AccountHolder {
  fullName: string | null
  cpf?: string | null
}

/** Nomes com menos palavras que isso não valem como "nome completo". */
export const MIN_HOLDER_NAME_WORDS = 2

function holderTokens(fullName: string | null | undefined): string[] {
  const tokens = normalizeText(fullName ?? '').split(' ').filter(Boolean)
  return tokens.length >= MIN_HOLDER_NAME_WORDS ? tokens : []
}

/** `needle` aparece em `hay` como sequência contígua de palavras inteiras. */
function containsSequence(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((t, j) => hay[i + j] === t)) return true
  }
  return false
}

export function matchesHolder(description: string, holder: AccountHolder | null | undefined): boolean {
  if (!holder) return false
  const tokens = normalizeText(description).split(' ').filter(Boolean)
  if (containsSequence(tokens, holderTokens(holder.fullName))) return true
  const cpf = (holder.cpf ?? '').replace(/\D/g, '')
  return cpf.length === 11 && tokens.includes(cpf)
}
