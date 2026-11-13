import { describe, it, expect } from 'vitest'
import {
  detectTransfers, planAbsorb, ABSORPTION_DATE_TOLERANCE_DAYS,
  type DetectionAccount, type DetectionExisting, type DetectionRow,
} from './transfer-detection'
import { fromDetection, absorbedLegDateIfDifferent, isAbsorbed } from './transfer-preview'

const SICREDI = 'acc-sicredi'
const BTG = 'acc-btg'
const accounts: DetectionAccount[] = [
  { id: SICREDI, name: 'Sicredi' },
  { id: BTG, name: 'BTG' },
]

/**
 * Perna pendente no BTG criada pela importação do Sicredi: PIX de saída no
 * Sicredi (principal) → espelho de entrada no BTG, sem extrato.
 */
function pendingLegInBtg(id: string, date: string, amount = 1000): DetectionExisting {
  return {
    id, accountId: BTG, date, amount, type: 'transfer', description: 'PAGAMENTO PIX - JOAO TITULAR',
    transferPairId: `pair-${id}`, isMirror: true, destinationAccountId: SICREDI, importHash: null,
  }
}

/** Linha do extrato do BTG: entrada (+). */
function btgRow(date: string, amount = 1000, description = 'PIX RECEBIDO JOAO TITULAR'): DetectionRow {
  return { accountId: BTG, date, description, amount }
}

describe(`absorção de perna pendente com tolerância de ${ABSORPTION_DATE_TOLERANCE_DAYS} dias`, () => {
  it('Sicredi 03/11 pendente para BTG + linha BTG de 31/10, mesmo valor → absorvida', () => {
    const [d] = detectTransfers([btgRow('2026-10-31')], accounts, [pendingLegInBtg('leg-1', '2026-11-03')])
    expect(d).toMatchObject({ status: 'matched', action: { kind: 'absorb', legId: 'leg-1' }, alreadyRecorded: true })
  })

  it('diferença de 4 dias → não absorve', () => {
    const [d] = detectTransfers([btgRow('2026-10-30')], accounts, [pendingLegInBtg('leg-1', '2026-11-03')])
    expect(d.status).toBe('none')
  })

  it('data exata e outro candidato a 2 dias → absorve a exata', () => {
    const [d] = detectTransfers([btgRow('2026-11-03')], accounts, [
      pendingLegInBtg('leg-2d', '2026-11-01'),
      pendingLegInBtg('leg-exata', '2026-11-03'),
    ])
    expect(d.action).toEqual({ kind: 'absorb', legId: 'leg-exata' })
  })

  it('dois candidatos sem data exata e empate de distância → não absorve e avisa', () => {
    const [d] = detectTransfers([btgRow('2026-11-02')], accounts, [
      pendingLegInBtg('leg-a', '2026-11-01'),
      pendingLegInBtg('leg-b', '2026-11-03'),
    ])
    expect(d).toMatchObject({ status: 'ambiguous', action: null, pendingTie: true })
    const t = fromDetection(d)
    expect(t?.pendingTie).toBe(true)
    expect(isAbsorbed(t)).toBe(false)
  })

  it('dois candidatos sem data exata, sem empate → absorve o mais próximo', () => {
    const [d] = detectTransfers([btgRow('2026-11-02')], accounts, [
      pendingLegInBtg('leg-3d', '2026-10-30'),
      pendingLegInBtg('leg-1d', '2026-11-03'),
    ])
    expect(d.action).toEqual({ kind: 'absorb', legId: 'leg-1d' })
    expect(d.pendingTie).toBeUndefined()
  })

  it('valores diferentes em 1 centavo → não absorve', () => {
    const [d] = detectTransfers([btgRow('2026-10-31', 1000.01)], accounts, [pendingLegInBtg('leg-1', '2026-11-03', 1000)])
    expect(d.status).toBe('none')
  })

  it('direção oposta à da perna → não absorve', () => {
    const [d] = detectTransfers([btgRow('2026-10-31', -1000)], accounts, [pendingLegInBtg('leg-1', '2026-11-03')])
    expect(d.status).toBe('none')
  })

  it('perna já absorvida (com import_hash) não é reutilizada', () => {
    const leg = { ...pendingLegInBtg('leg-1', '2026-11-03'), importHash: 'h-antigo' }
    const [d] = detectTransfers([btgRow('2026-10-31')], accounts, [leg])
    expect(d.status).toBe('none')
  })

  it('mesma perna disputada por duas linhas do arquivo: fica com a mais próxima; a outra não a reutiliza', () => {
    const dets = detectTransfers(
      [btgRow('2026-10-31', 1000, 'PIX A'), btgRow('2026-11-03', 1000, 'PIX B')],
      accounts,
      [pendingLegInBtg('leg-1', '2026-11-03')],
    )
    expect(dets[1].action).toEqual({ kind: 'absorb', legId: 'leg-1' })
    expect(dets[0].action?.kind).not.toBe('absorb')
    expect(dets[0].status).toBe('none')
  })

  it('duas linhas a mesma distância da mesma perna → nenhuma absorve', () => {
    const dets = detectTransfers(
      [btgRow('2026-11-01', 1000, 'PIX A'), btgRow('2026-11-05', 1000, 'PIX B')],
      accounts,
      [pendingLegInBtg('leg-1', '2026-11-03')],
    )
    expect(dets.map(d => d.status)).toEqual(['ambiguous', 'ambiguous'])
    expect(dets.every(d => d.action === null)).toBe(true)
  })

  it('o Sinal A com data diferente continua não casando', () => {
    const income: DetectionExisting = {
      id: 'e1', accountId: SICREDI, date: '2026-11-03', amount: 1000, type: 'income', description: 'PIX',
      transferPairId: null, isMirror: false, destinationAccountId: null, importHash: null,
    }
    const [d] = detectTransfers([btgRow('2026-10-31', -1000, 'PIX ENVIADO')], accounts, [income])
    expect(d.status).toBe('none')
    const [same] = detectTransfers([btgRow('2026-11-03', -1000, 'PIX ENVIADO')], accounts, [income])
    expect(same.status).toBe('suggested')
  })
})

describe('data da perna absorvida', () => {
  it('planAbsorb passa a perna para a data do extrato', () => {
    const ops = planAbsorb(
      { accountId: BTG, date: '2026-10-31', description: 'PIX', amount: 1000, importHash: 'h1', bankTransactionId: null },
      'leg-1', 'pair-1',
    )
    expect(ops[0]).toEqual({ op: 'update', id: 'leg-1', patch: { import_hash: 'h1', bank_transaction_id: null, date: '2026-10-31' } })
    expect(ops[1]).toEqual({ op: 'updatePair', pairId: 'pair-1', patch: { transfer_status: 'matched' } })
  })

  it('prévia: avisa a data original quando difere; data igual não avisa', () => {
    const shifted = fromDetection(detectTransfers([btgRow('2026-10-31')], accounts, [pendingLegInBtg('leg-1', '2026-11-03')])[0])
    expect(absorbedLegDateIfDifferent(shifted, '2026-10-31')).toBe('2026-11-03')
    const exact = fromDetection(detectTransfers([btgRow('2026-11-03')], accounts, [pendingLegInBtg('leg-1', '2026-11-03')])[0])
    expect(absorbedLegDateIfDifferent(exact, '2026-11-03')).toBeNull()
  })
})
