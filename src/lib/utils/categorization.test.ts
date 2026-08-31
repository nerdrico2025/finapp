import { describe, it, expect } from 'vitest'
import { normalizeDescription, keywordFallback, type CategoryOption } from './categorization'

// Categorias padrão criadas para novos usuários (ver ensureDefaultCategoriesForImport
// em src/lib/actions/categories.ts) — usadas aqui porque são o cenário mais comum
// de uma primeira importação, exatamente o caso relatado no bug.
const DEFAULT_CATEGORIES: CategoryOption[] = [
  { id: 'alimentacao', name: 'Alimentação', type: 'expense', icon: '🍽️', parent_id: null },
  { id: 'assinaturas', name: 'Assinaturas', type: 'expense', icon: '📱', parent_id: null },
  { id: 'lazer', name: 'Lazer', type: 'expense', icon: '🎬', parent_id: null },
  { id: 'moradia', name: 'Moradia', type: 'expense', icon: '🏠', parent_id: null },
  { id: 'outros', name: 'Outros', type: 'expense', icon: '📦', parent_id: null },
  { id: 'saude', name: 'Saúde', type: 'expense', icon: '💊', parent_id: null },
  { id: 'transferencia', name: 'Transferência', type: 'expense', icon: '↔️', parent_id: null },
  { id: 'transporte', name: 'Transporte', type: 'expense', icon: '🚗', parent_id: null },
  { id: 'receitas', name: 'Receitas', type: 'income', icon: '💰', parent_id: null },
]

describe('normalizeDescription', () => {
  it('lowercases, strips accents and collapses punctuation to spaces', () => {
    expect(normalizeDescription('Supermercado — Bom De Preço')).toBe('supermercado bom de preco')
  })

  it('collapses repeated whitespace and trims', () => {
    expect(normalizeDescription('  Uber   *Trip  ')).toBe('uber trip')
  })
})

describe('keywordFallback — descrições reconhecíveis recebem a categoria correta', () => {
  it('mapeia "Supermercado — Bom De Preço" para Alimentação', () => {
    const id = keywordFallback('Supermercado — Bom De Preço', DEFAULT_CATEGORIES)
    expect(id).toBe('alimentacao')
  })

  it('mapeia "Uber *Trip São Paulo" para Transporte', () => {
    const id = keywordFallback('Uber *Trip São Paulo', DEFAULT_CATEGORIES)
    expect(id).toBe('transporte')
  })

  it('mapeia "Ifood *Restaurante Chines" para Alimentação', () => {
    const id = keywordFallback('Ifood *Restaurante Chines', DEFAULT_CATEGORIES)
    expect(id).toBe('alimentacao')
  })

  it('mapeia "Netflix.com" para uma categoria de entretenimento/assinatura ("Lazer" ganha por ser a primeira das categorias-padrão a bater um dos padrões do grupo streaming)', () => {
    const id = keywordFallback('Netflix.com', DEFAULT_CATEGORIES)
    expect(id).toBe('lazer')
  })

  it('mapeia "Salário Empresa XYZ Ltda" para Receitas', () => {
    const id = keywordFallback('Salário Empresa XYZ Ltda', DEFAULT_CATEGORIES)
    expect(id).toBe('receitas')
  })

  it('retorna null para uma descrição genérica sem nenhum padrão reconhecível', () => {
    const id = keywordFallback('DOC 000123456 REF 9F8A2', DEFAULT_CATEGORIES)
    expect(id).toBeNull()
  })
})
