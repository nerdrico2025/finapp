import { describe, it, expect } from 'vitest'
import { chooseDestination, chooseCandidate, clearTransfer, fromDetection, importActionOf, isAbsorbed } from './transfer-preview'
import type { TransferCandidate } from './transfer-detection'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  markAsTransfer, holderTransfer, needsDestination, previewTransferState, isTransferRow,
  checkedAfterDetection, checkedAfterTransferEdit, applyTypeChoice, rowKind,
} from './transfer-preview'
import { detectTransfers, type TransferDetection } from './transfer-detection'
import { csvToRaw } from './csv'
import { parseSicrediCsv } from './profiles/sicredi'

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

// ─── Transferência sem destino, sinal titular, tipo e marcação ────────────────

describe('transferência sem conta destino', () => {
  it('nunca gera ação de escrita', () => {
    expect(importActionOf(markAsTransfer(null))).toBeNull()
    expect(importActionOf(holderTransfer())).toBeNull()
    expect(needsDestination(markAsTransfer(null))).toBe(true)
  })

  it('escolher o destino marca a linha e mantém o selo de titular', () => {
    const row = { checked: false }
    const next = chooseDestination(holderTransfer(), 'acc-nubank')
    expect(next).toMatchObject({ status: 'pending', destinationAccountId: 'acc-nubank', holder: true })
    expect(checkedAfterTransferEdit(row, holderTransfer(), next)).toBe(true)
  })

  it('sem destino desmarca; voltar a receita/despesa remarca (salvo duplicata/aviso)', () => {
    expect(checkedAfterTransferEdit({ checked: true }, null, markAsTransfer(null))).toBe(false)
    expect(checkedAfterTransferEdit({ checked: false }, markAsTransfer(null), clearTransfer(markAsTransfer(null)))).toBe(true)
    expect(checkedAfterTransferEdit({ checked: false, duplicate: {} }, markAsTransfer(null), clearTransfer(null))).toBe(false)
    expect(checkedAfterTransferEdit({ checked: false, warning: 'x' }, markAsTransfer(null), clearTransfer(null))).toBe(false)
  })

  it('detecção: sem destino desmarca, o resto preserva', () => {
    expect(checkedAfterDetection({ checked: true }, holderTransfer())).toBe(false)
    expect(checkedAfterDetection({ checked: true }, null)).toBe(true)
  })
})

describe('previewTransferState — prioridade dos sinais', () => {
  const holder = { fullName: 'Joao Titular Exemplo' }
  const desc = 'PAGAMENTO PIX - 11122233344 JOAO TITULAR EXEMPLO'

  it('sem detecção, o nome do titular pré-marca transferência sem destino', () => {
    expect(previewTransferState(null, desc, holder)).toMatchObject({ status: 'unassigned', holder: true, manual: false })
  })

  it('sinal A/B vence o titular', () => {
    const det: TransferDetection = {
      status: 'suggested', action: { kind: 'convert', existingId: 'e1' },
      candidates: [{ kind: 'existing', id: 'e1', accountId: 'acc-nu', date: '2026-11-05', amount: 5, description: null }],
      destinationAccountId: 'acc-nu', alreadyRecorded: false, nameMatchAccountId: null,
    }
    const t = previewTransferState(det, desc, holder)
    expect(t).toMatchObject({ status: 'suggested', destinationAccountId: 'acc-nu' })
    expect(t?.holder).toBeFalsy()
  })

  it('descrição sem o nome: nada', () => {
    expect(previewTransferState(null, 'PAGAMENTO PIX - ANA PESSOA FICTICIA', holder)).toBeNull()
  })
})

describe('applyTypeChoice', () => {
  it('Transferência preserva valor e sinal', () => {
    const p = applyTypeChoice({ type: 'expense', amount: -80, transfer: null }, 'transfer')
    expect(p).toMatchObject({ type: 'expense', amount: -80, resetCategory: false })
    expect(isTransferRow(p.transfer)).toBe(true)
    expect(rowKind({ type: 'expense', amount: -80, transfer: p.transfer })).toBe('transfer')
  })

  it('de Transferência para o tipo do sinal: só desfaz', () => {
    const p = applyTypeChoice({ type: 'income', amount: 1220, transfer: holderTransfer() }, 'income')
    expect(p).toMatchObject({ type: 'income', amount: 1220, resetCategory: false })
    expect(p.transfer?.status).toBe('none')
  })

  it('de Transferência para o tipo oposto: desfaz e inverte o sinal, valor absoluto igual', () => {
    const p = applyTypeChoice({ type: 'expense', amount: -80, transfer: markAsTransfer(null) }, 'income')
    expect(p).toMatchObject({ type: 'income', amount: 80, resetCategory: true })
  })

  it('Receita ↔ Despesa sem transferência: inverte como o botão de antes', () => {
    expect(applyTypeChoice({ type: 'expense', amount: -80, transfer: null }, 'income'))
      .toEqual({ type: 'income', amount: 80, transfer: null, resetCategory: true })
    expect(applyTypeChoice({ type: 'expense', amount: -80, transfer: null }, 'expense'))
      .toEqual({ type: 'expense', amount: -80, transfer: null, resetCategory: false })
  })
})

describe('fixture sicredi-extrato.csv com titular fictício', () => {
  it('linhas do titular saem como Transferência sem destino e desmarcadas', () => {
    const text = readFileSync(fileURLToPath(new URL('./__fixtures__/sicredi-extrato.csv', import.meta.url)), 'utf8')
    const { headers, rawRows } = csvToRaw(text)
    const rows = parseSicrediCsv(headers, rawRows)
    const signed = (r: (typeof rows)[number]) => (r.type === 'expense' ? -Math.abs(r.amount) : Math.abs(r.amount))
    const dets = detectTransfers(
      rows.map(r => ({ accountId: 'acc-sicredi', date: r.date, description: r.description, amount: signed(r) })),
      [{ id: 'acc-sicredi', name: 'Sicredi' }, { id: 'acc-nubank', name: 'Nubank' }],
      [],
    )
    const holder = { fullName: 'João Titular Exemplo' }
    const states = rows.map((r, k) => previewTransferState(dets[k], r.description, holder))
    const checked = rows.map((r, k) => checkedAfterDetection({ checked: !r.error && !r.warning }, states[k]))

    const titular = rows.map((r, k) => ({ r, t: states[k], c: checked[k] })).filter(x => /titular exemplo/i.test(x.r.description))
    expect(titular).toHaveLength(10)
    for (const x of titular) {
      expect(x.t).toMatchObject({ status: 'unassigned', holder: true, destinationAccountId: null })
      expect(x.c).toBe(false)
      expect(importActionOf(x.t)).toBeNull()
    }
    const others = rows.map((r, k) => ({ r, t: states[k] })).filter(x => !/titular exemplo/i.test(x.r.description))
    expect(others.every(x => x.t === null)).toBe(true)
  })
})
