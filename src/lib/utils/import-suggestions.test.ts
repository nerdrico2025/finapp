import { describe, it, expect } from 'vitest'
import { mergeSuggestionIntoRow, getCategoryBadge } from './import-suggestions'

describe('mergeSuggestionIntoRow', () => {
  it('aplica uma sugestão de regra aprendida (alta confiança)', () => {
    const result = mergeSuggestionIntoRow(
      { categoryId: null, source: null },
      { category_id: 'cat-transporte', source: 'rule', confidence: 'high' },
    )
    expect(result).toEqual({ categoryId: 'cat-transporte', source: 'rule', confidence: 'high' })
  })

  it('aplica uma sugestão da IA de baixa confiança — regressão do bug em que essas eram descartadas', () => {
    // Caso real do bug reportado: "Alimentação — Nova Goulart" não bate com
    // nenhum padrão de palavra-chave nem com histórico do usuário, então a
    // IA só consegue dar um palpite de baixa confiança. Antes, a linha
    // ficava sem categoria (o filtro só aceitava high/medium); agora a
    // sugestão é aplicada e cabe à UI marcar visualmente a baixa confiança.
    const result = mergeSuggestionIntoRow(
      { categoryId: null, source: null },
      { category_id: 'cat-alimentacao', source: 'ai', confidence: 'low' },
    )
    expect(result.categoryId).toBe('cat-alimentacao')
    expect(result.source).toBe('ai')
    expect(result.confidence).toBe('low')
  })

  it('não sobrescreve uma categoria escolhida manualmente pelo usuário', () => {
    const result = mergeSuggestionIntoRow(
      { categoryId: 'cat-escolhida-pelo-usuario', source: 'manual' },
      { category_id: 'cat-sugerida-pela-ia', source: 'ai', confidence: 'high' },
    )
    expect(result).toEqual({ categoryId: 'cat-escolhida-pelo-usuario', source: 'manual', confidence: null })
  })

  it('não altera a linha quando a sugestão não veio com categoria', () => {
    const result = mergeSuggestionIntoRow(
      { categoryId: null, source: null },
      { category_id: null, source: 'ai', confidence: 'low' },
    )
    expect(result).toEqual({ categoryId: null, source: null, confidence: null })
  })

  it('permite que uma sugestão nova substitua uma sugestão automática anterior (não-manual)', () => {
    const result = mergeSuggestionIntoRow(
      { categoryId: 'cat-antiga', source: 'keyword' },
      { category_id: 'cat-nova', source: 'ai', confidence: 'medium' },
    )
    expect(result.categoryId).toBe('cat-nova')
    expect(result.source).toBe('ai')
  })
})

describe('getCategoryBadge — indicador visual exibido na pré-visualização', () => {
  it('sugestão da IA com baixa confiança usa o badge distinto "ai_low"', () => {
    expect(getCategoryBadge({ source: 'ai', confidence: 'low' })).toBe('ai_low')
  })

  it('sugestão da IA com confiança média ou alta usa o badge "ai" normal', () => {
    expect(getCategoryBadge({ source: 'ai', confidence: 'medium' })).toBe('ai')
    expect(getCategoryBadge({ source: 'ai', confidence: 'high' })).toBe('ai')
  })

  it('regra aprendida usa o badge "rule", independente de confidence', () => {
    expect(getCategoryBadge({ source: 'rule', confidence: 'low' })).toBe('rule')
  })

  it('sem sugestão nenhuma, não mostra nenhum badge', () => {
    expect(getCategoryBadge({ source: null })).toBeNull()
  })
})
