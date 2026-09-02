/**
 * Fonte única de verdade para os grupos do DRE.
 *
 * Os valores devem permanecer em sincronia com o CHECK constraint da coluna
 * `categories.dre_group` (supabase/migrations/20260527_dre_group.sql).
 */

export const DRE_GROUPS = [
  { value: 'receita_bruta',       label: 'Receita Bruta' },
  { value: 'deducoes',            label: 'Deduções / Impostos' },
  { value: 'cmv',                 label: 'CMV / Custos' },
  { value: 'despesa_operacional', label: 'Despesas Operacionais' },
  { value: 'depreciacao',         label: 'Depreciação / Amortização' },
] as const

export type DREGroupKey = typeof DRE_GROUPS[number]['value']

/** Mesmos valores em formato de tupla não-vazia, aceito por `z.enum()`. */
export const DRE_GROUP_VALUES = DRE_GROUPS.map(g => g.value) as [DREGroupKey, ...DREGroupKey[]]
