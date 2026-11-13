// Validação do nome de uma categoria criada pela prévia da importação.

import { normalizeDescription } from './categorization'

export interface ExistingCategoryName {
  name: string
  type: 'income' | 'expense'
}

/**
 * Mensagem de erro para o toast, ou null se o nome serve. Duplicado = mesmo
 * nome (sem diferença de acento/caixa/espaços) e mesmo tipo.
 */
export function validateNewCategoryName(
  rawName: string,
  type: 'income' | 'expense',
  existing: ExistingCategoryName[],
): string | null {
  const name = rawName.trim()
  if (!name) return 'Informe o nome da categoria.'
  if (name.length > 40) return 'O nome da categoria pode ter no máximo 40 caracteres.'
  const key = normalizeDescription(name)
  const dup = existing.find((c) => c.type === type && normalizeDescription(c.name) === key)
  if (dup) return `Já existe a categoria de ${type === 'income' ? 'receita' : 'despesa'} "${dup.name}".`
  return null
}
