// Lógica pura em torno de sugestões de categoria na pré-visualização de
// importação (ImportCSVForm) — extraída para ser testável isoladamente do
// componente React (que depende de estado, Supabase e do DOM).

export type SuggestionSource = 'rule' | 'ai' | 'keyword' | 'auto'
export type RowSource = SuggestionSource | 'manual' | null
export type Confidence = 'high' | 'medium' | 'low'

export interface RowSuggestionState {
  categoryId: string | null
  source: RowSource
}

export interface CategorySuggestionInput {
  category_id: string | null
  source: SuggestionSource
  confidence: Confidence
}

/**
 * Decide como uma sugestão vinda do classificador (regra/IA/palavra-chave)
 * deve atualizar o estado de uma linha da pré-visualização.
 *
 * Regras:
 * - Sem category_id sugerido → linha não muda (nunca "limpa" uma categoria
 *   que já foi escolhida).
 * - Categoria escolhida manualmente pelo usuário → nunca é sobrescrita por
 *   uma sugestão que chega depois (ex.: resposta atrasada da IA).
 * - Qualquer outra sugestão com category_id — inclusive baixa confiança —
 *   é aplicada. Antes, sugestões de baixa confiança eram descartadas e a
 *   linha ficava em branco; agora elas aparecem sempre, e a UI é quem marca
 *   visualmente a baixa confiança (ver getCategoryBadge).
 */
export function mergeSuggestionIntoRow(
  row: RowSuggestionState,
  suggestion: CategorySuggestionInput,
): { categoryId: string | null; source: RowSource; confidence: Confidence | null } {
  if (!suggestion.category_id) {
    return { categoryId: row.categoryId, source: row.source, confidence: null }
  }
  if (row.categoryId && row.source === 'manual') {
    return { categoryId: row.categoryId, source: row.source, confidence: null }
  }
  return { categoryId: suggestion.category_id, source: suggestion.source, confidence: suggestion.confidence }
}

export type CategoryBadgeKind = 'auto' | 'rule' | 'ai' | 'ai_low' | 'keyword' | 'manual' | null

/**
 * Determina qual badge mostrar ao lado do seletor de categoria de uma linha.
 * Sugestões da IA com confiança baixa recebem o badge distinto 'ai_low'
 * (âmbar, "Sugerido — revisar") em vez do badge roxo padrão de IA — o
 * usuário ainda pode editar a categoria normalmente, é só um sinalizador.
 */
export function getCategoryBadge(row: { source: RowSource; confidence?: Confidence | null }): CategoryBadgeKind {
  if (row.source === 'ai' && row.confidence === 'low') return 'ai_low'
  if (row.source === null) return null
  return row.source
}
