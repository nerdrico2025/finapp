import { describe, it, expect } from 'vitest'
import { chooseDestination, chooseCandidate, clearTransfer, fromDetection, importActionOf, isAbsorbed } from './transfer-preview'
import type { TransferCandidate } from './transfer-detection'

const e1: TransferCandidate = { kind: 'existing', id: 'e1', accountId: 'itau', date: '2026-09-10', amount: 100, description: null }
const e2: TransferCandidate = { kind: 'existing', id: 'e2', accountId: 'btg', date: '2026-09-10', amount: 100, description: null }

describe('transfer-preview', () => {
  it('ambíguo não gera ação até o usuário escolher o par', () => {
    const t = fromDetection({
      status: 'ambiguous', action: null, candidates: [e1, e2],
      destinationAccountId: null, alreadyRecorded: false, nameMatchAccountId: null,
    })!
    expect(importActionOf(t)).toBeNull()
    const chosen = chooseCandidate(t, e2)
    expect(chosen).toMatchObject({ status: 'matched', destinationAccountId: 'btg', manual: true })
    expect(importActionOf(chosen)).toEqual({ kind: 'convert', existingId: 'e2' })
  })

  it('escolher a conta destino usa a contraparte existente, ou cria o par pendente', () => {
    expect(importActionOf(chooseDestination(null, 'nubank'))).toEqual({ kind: 'createPair', counterpartAccountId: 'nubank' })
    const t = fromDetection({
      status: 'ambiguous', action: null, candidates: [e1, e2],
      destinationAccountId: null, alreadyRecorded: false, nameMatchAccountId: null,
    })
    expect(importActionOf(chooseDestination(t, 'itau'))).toEqual({ kind: 'convert', existingId: 'e1' })
  })

  it('"não é transferência" prevalece, inclusive sobre linha já registrada', () => {
    const t = fromDetection({
      status: 'matched', action: { kind: 'absorb', legId: 'l1' }, candidates: [],
      destinationAccountId: 'itau', alreadyRecorded: true, nameMatchAccountId: null,
    })!
    expect(isAbsorbed(t)).toBe(true)
    const cleared = clearTransfer(t)
    expect(isAbsorbed(cleared)).toBe(false)
    expect(importActionOf(cleared)).toBeNull()
  })
})
