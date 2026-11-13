import { describe, it, expect } from 'vitest'
import { validateNewCategoryName } from './new-category'

const existing = [
  { name: 'Alimentação', type: 'expense' as const },
  { name: 'Salário', type: 'income' as const },
]

describe('validateNewCategoryName', () => {
  it('nome vazio', () => {
    expect(validateNewCategoryName('   ', 'expense', existing)).toBe('Informe o nome da categoria.')
  })
  it('duplicado no mesmo tipo, ignorando acento e caixa', () => {
    expect(validateNewCategoryName(' alimentacao ', 'expense', existing)).toBe('Já existe a categoria de despesa "Alimentação".')
  })
  it('mesmo nome em outro tipo é permitido', () => {
    expect(validateNewCategoryName('Alimentação', 'income', existing)).toBeNull()
  })
  it('nome longo demais', () => {
    expect(validateNewCategoryName('x'.repeat(41), 'expense', existing)).toMatch(/40 caracteres/)
  })
  it('nome válido', () => {
    expect(validateNewCategoryName('Pousada', 'income', existing)).toBeNull()
  })
})
