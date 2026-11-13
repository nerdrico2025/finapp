import { describe, it, expect } from 'vitest'
import { matchesHolder } from './holder-signal'

const holder = { fullName: 'Joao Titular Exemplo' }

describe('matchesHolder (sinal titular)', () => {
  it.each([
    ['PAGAMENTO PIX - 11122233344 JOAO TITULAR EXEMPLO', true],
    ['RECEBIMENTO PIX - 11122233344 Joao Titular Exemplo', true],
    ['PIX ENVIADO joao   titular    exemplo', true],
    ['PAGAMENTO PIX - JOAO TITULAR EXEMPLOLANDIA', false],   // palavra parcial
    ['PAGAMENTO PIX - JOAO TITULAR', false],            // nome incompleto
    ['PAGAMENTO PIX - JOAO EXEMPLO TITULAR', false],       // ordem diferente
    ['PAGAMENTO PIX - ANA PESSOA FICTICIA', false],
    ['PAGAMENTO PIX - XJOAO TITULAR EXEMPLO', false],
  ])('%s → %s', (desc, expected) => {
    expect(matchesHolder(desc, holder)).toBe(expected)
  })

  it('ignora acento e caixa dos dois lados', () => {
    expect(matchesHolder('PIX - JOAO ESTEVAO', { fullName: 'João Estêvão' })).toBe(true)
    expect(matchesHolder('PIX - joão estêvão', { fullName: 'JOAO ESTEVAO' })).toBe(true)
  })

  it('nome de uma palavra só não vale como nome completo', () => {
    expect(matchesHolder('PIX - JOAO', { fullName: 'Joao' })).toBe(false)
  })

  it('sem titular ou sem nome, nunca casa', () => {
    expect(matchesHolder('PIX - JOAO TITULAR EXEMPLO', null)).toBe(false)
    expect(matchesHolder('PIX - JOAO TITULAR EXEMPLO', { fullName: null })).toBe(false)
  })

  it('CPF como sequência de dígitos inteira', () => {
    const h = { fullName: null, cpf: '111.222.333-44' }
    expect(matchesHolder('PAGAMENTO PIX - 11122233344 FULANO', h)).toBe(true)
    expect(matchesHolder('PAGAMENTO PIX - 111222333440 FULANO', h)).toBe(false)
  })
})
