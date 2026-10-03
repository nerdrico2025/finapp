import { describe, it, expect, beforeEach } from 'vitest'
import {
  detectTransfers,
  matchAccountByName,
  planAbsorb,
  planConvert,
  planCreatePair,
  planPairRows,
  planLinkExisting,
  planLinkToAccount,
  planUnlink,
  planCompleteOrphan,
  findHistoricalPairs,
  type DetectionAccount,
  type DetectionExisting,
  type DetectionRow,
  type PlannedOp,
  type TxDraft,
} from './transfer-detection'

// ─── Simulador em memória ─────────────────────────────────────────────────────
// Replica o necessário do banco: a tabela transactions e a regra de saldo de
// recalculate_account_balance (migration 20260529003_transfer_pair.sql).

type DbRow = TxDraft & { id: string; transfer_amount?: number | null }

const ITAU = 'acc-itau'
const NUBANK = 'acc-nubank'
const BTG = 'acc-btg'
const CARTAO_BTG = 'acc-cartao-btg'

const accounts: DetectionAccount[] = [
  { id: ITAU, name: 'Itaú' },
  { id: NUBANK, name: 'Nubank' },
  { id: BTG, name: 'BTG' },
  { id: CARTAO_BTG, name: 'Cartão BTG' },
]

let db: DbRow[]
let seq: number

beforeEach(() => {
  db = []
  seq = 0
})

function hash(amount: number, date: string, description: string) {
  // Mesma composição do generateImportHash (sem a conta, sem o user).
  return `${Math.abs(amount)}|${date}|${description.toLowerCase().trim()}`
}

function balance(accountId: string, initial = 0): number {
  return initial + db.reduce((sum, t) => {
    if (t.is_mirror) return sum
    if (t.type === 'income' && t.account_id === accountId) return sum + t.amount
    if (t.type === 'expense' && t.account_id === accountId) return sum - t.amount
    if (t.type === 'transfer' && t.account_id === accountId) return sum - t.amount
    if (t.type === 'transfer' && t.destination_account_id === accountId) return sum + (t.transfer_amount ?? t.amount)
    return sum
  }, 0)
}

function apply(ops: PlannedOp[]) {
  for (const op of ops) {
    if (op.op === 'insert') db.push({ ...op.row, id: `tx-${++seq}` })
    else if (op.op === 'update') db = db.map(t => t.id === op.id ? { ...t, ...op.patch } : t)
    else db = db.map(t => t.transfer_pair_id === op.pairId ? { ...t, ...op.patch } : t)
  }
}

function plain(accountId: string, amount: number, date: string, description: string, withHash = true): DbRow {
  const row: DbRow = {
    id: `tx-${++seq}`,
    account_id: accountId,
    type: amount < 0 ? 'expense' : 'income',
    amount: Math.abs(amount),
    date,
    description,
    destination_account_id: null,
    transfer_pair_id: null,
    is_mirror: false,
    transfer_status: null,
    import_hash: withHash ? hash(amount, date, description) : null,
    bank_transaction_id: null,
    category_id: null,
    category_source: null,
  }
  db.push(row)
  return row
}

function existing(): DetectionExisting[] {
  return db.map(t => ({
    id: t.id,
    accountId: t.account_id,
    date: t.date,
    amount: t.amount,
    type: t.type,
    description: t.description,
    transferPairId: t.transfer_pair_id,
    isMirror: t.is_mirror,
    destinationAccountId: t.destination_account_id,
    importHash: t.import_hash,
    bankTransactionId: t.bank_transaction_id,
  }))
}

type Line = [amount: number, date: string, description: string]

/**
 * Importa um extrato como o servidor faz: detecção antes da deduplicação,
 * aceitando o que a prévia traz marcado (matched / suggested / pending).
 * Linhas 'none' e 'ambiguous' entram como income/expense comuns, com a
 * deduplicação por hash de sempre.
 */
function importStatement(accountId: string, lines: Line[]) {
  const rows: DetectionRow[] = lines.map(([amount, date, description]) => ({
    accountId, amount, date, description, importHash: hash(amount, date, description),
  }))
  const dets = detectTransfers(rows, accounts, existing())
  dets.forEach((d, i) => {
    const r = rows[i]
    const planRow = { ...r, importHash: r.importHash ?? null, bankTransactionId: null }
    const a = d.action
    const pairId = `pair-${++seq}`
    if (a?.kind === 'absorb') {
      const legRow = db.find(t => t.id === a.legId)!
      apply(planAbsorb(planRow, a.legId, legRow.transfer_pair_id!))
    } else if (a?.kind === 'convert') {
      const e = db.find(t => t.id === a.existingId)!
      apply(planConvert(planRow, { id: e.id, accountId: e.account_id, type: e.type }, pairId))
    } else if (a?.kind === 'createPair') {
      apply(planCreatePair(planRow, a.counterpartAccountId, pairId, 'pending'))
    } else {
      if (db.some(t => t.import_hash === r.importHash)) return // dedup por hash existente
      plain(accountId, r.amount, r.date, r.description)
    }
  })
  return dets
}

/** Estado comparável, independente de ids e da ordem de inserção. */
function snapshot() {
  return db
    .map(t => `${t.account_id}|${t.type}|${t.amount}|mirror=${t.is_mirror}|dest=${t.destination_account_id}|${t.transfer_status}|paired=${!!t.transfer_pair_id}`)
    .sort()
}

const D = '2026-09-10'

// ─── Sinal B ──────────────────────────────────────────────────────────────────

describe('matchAccountByName', () => {
  it('"Cartão BTG" vence "BTG" (maior nome primeiro)', () => {
    expect(matchAccountByName('PAGAMENTO CARTAO BTG', accounts, ITAU)).toBe(CARTAO_BTG)
    expect(matchAccountByName('TED para BTG Pactual', accounts, ITAU)).toBe(BTG)
  })

  it('ignora a própria conta e não libera o nome menor contido nela', () => {
    expect(matchAccountByName('Cartão BTG anuidade', accounts, CARTAO_BTG)).toBeNull()
    expect(matchAccountByName('Pagamento recebido BTG', accounts, CARTAO_BTG)).toBe(BTG)
  })

  it('ignora acento e caixa, mas exige o nome completo como palavra', () => {
    expect(matchAccountByName('pix enviado ITAU', accounts, NUBANK)).toBe(ITAU)
    expect(matchAccountByName('Nubankers Club', accounts, ITAU)).toBeNull()
    expect(matchAccountByName('Internet fibra', [...accounts, { id: 'acc-inter', name: 'Inter' }], ITAU)).toBeNull()
  })
})

// ─── Classificação ────────────────────────────────────────────────────────────

describe('detectTransfers', () => {
  it('A + B: par espelhado e nome da conta → matched, vinculado (conversão)', () => {
    const e = plain(ITAU, -1000, D, 'PIX enviado')
    const [d] = detectTransfers(
      [{ accountId: NUBANK, amount: 1000, date: D, description: 'Transferência recebida Itaú' }],
      accounts, existing(),
    )
    expect(d.status).toBe('matched')
    expect(d.action).toEqual({ kind: 'convert', existingId: e.id })
    expect(d.destinationAccountId).toBe(ITAU)
  })

  it('A com candidato único → suggested', () => {
    const e = plain(ITAU, -1000, D, 'PIX enviado')
    const [d] = detectTransfers(
      [{ accountId: NUBANK, amount: 1000, date: D, description: 'PIX recebido' }],
      accounts, existing(),
    )
    expect(d.status).toBe('suggested')
    expect(d.action).toEqual({ kind: 'convert', existingId: e.id })
  })

  it('A ambíguo: dois candidatos → ambiguous, sem ação automática', () => {
    plain(ITAU, -1000, D, 'PIX enviado')
    plain(BTG, -1000, D, 'TED enviada')
    const [d] = detectTransfers(
      [{ accountId: NUBANK, amount: 1000, date: D, description: 'PIX recebido' }],
      accounts, existing(),
    )
    expect(d.status).toBe('ambiguous')
    expect(d.action).toBeNull()
    expect(d.candidates).toHaveLength(2)
  })

  it('A ambíguo + B desempata para a conta citada', () => {
    const e = plain(ITAU, -1000, D, 'PIX enviado')
    plain(BTG, -1000, D, 'TED enviada')
    const [d] = detectTransfers(
      [{ accountId: NUBANK, amount: 1000, date: D, description: 'PIX recebido de Itau' }],
      accounts, existing(),
    )
    expect(d.status).toBe('matched')
    expect(d.action).toEqual({ kind: 'convert', existingId: e.id })
  })

  it('B sem par → pending com a conta destino', () => {
    const [d] = detectTransfers(
      [{ accountId: ITAU, amount: -500, date: D, description: 'TED para Nubank' }],
      accounts, existing(),
    )
    expect(d.status).toBe('pending')
    expect(d.action).toEqual({ kind: 'createPair', counterpartAccountId: NUBANK })
  })

  it('nenhum sinal → none', () => {
    plain(ITAU, -1000, '2026-09-11', 'PIX enviado') // data diferente: fora da tolerância 0
    const [d] = detectTransfers(
      [{ accountId: NUBANK, amount: 1000, date: D, description: 'PIX recebido' }],
      accounts, existing(),
    )
    expect(d.status).toBe('none')
  })

  it('ignora transações que já pertencem a um par como candidatas de conversão', () => {
    apply(planCreatePair(
      { accountId: ITAU, amount: -1000, date: D, description: 'X', importHash: 'h', bankTransactionId: null },
      BTG, 'p1', 'matched',
    ))
    const [d] = detectTransfers(
      [{ accountId: NUBANK, amount: 1000, date: D, description: 'PIX recebido' }],
      accounts, existing(),
    )
    expect(d.status).toBe('none')
  })

  it('duas linhas disputando a mesma contraparte → ambas ambiguous', () => {
    plain(ITAU, -1000, D, 'PIX enviado')
    const dets = detectTransfers(
      [
        { accountId: NUBANK, amount: 1000, date: D, description: 'PIX recebido A' },
        { accountId: NUBANK, amount: 1000, date: D, description: 'PIX recebido B' },
      ],
      accounts, existing(),
    )
    expect(dets.map(d => d.status)).toEqual(['ambiguous', 'ambiguous'])
    expect(dets.every(d => d.action === null)).toBe(true)
  })

  it('procura a contraparte nas outras linhas do lote', () => {
    const dets = detectTransfers(
      [
        { accountId: ITAU, amount: -300, date: D, description: 'TED Nubank' },
        { accountId: NUBANK, amount: 300, date: D, description: 'TED recebida' },
      ],
      accounts, [],
    )
    expect(dets[0]).toMatchObject({ status: 'matched', action: { kind: 'pairRow', rowIndex: 1 } })
    expect(dets[1]).toMatchObject({ status: 'matched', action: { kind: 'pairRow', rowIndex: 0 } })

    apply(planPairRows(
      { accountId: ITAU, amount: -300, date: D, description: 'TED Nubank', importHash: 'h1', bankTransactionId: null },
      { accountId: NUBANK, amount: 300, date: D, description: 'TED recebida', importHash: 'h2', bankTransactionId: null },
      'p1',
    ))
    expect(balance(ITAU)).toBe(-300)
    expect(balance(NUBANK)).toBe(300)
  })
})

// ─── Conversão preserva o saldo ───────────────────────────────────────────────

describe('conversão', () => {
  it('E é saída: E vira principal, L entra como espelho; saldo de X não muda', () => {
    const e = plain(ITAU, -1000, D, 'PIX enviado')
    const before = balance(ITAU)
    importStatement(NUBANK, [[1000, D, 'PIX recebido']])

    expect(balance(ITAU)).toBe(before)
    expect(balance(NUBANK)).toBe(1000)
    const conv = db.find(t => t.id === e.id)!
    expect(conv).toMatchObject({ type: 'transfer', is_mirror: false, destination_account_id: NUBANK, transfer_status: 'matched' })
    const mirror = db.find(t => t.account_id === NUBANK)!
    expect(mirror).toMatchObject({ type: 'transfer', is_mirror: true, destination_account_id: ITAU })
  })

  it('E é entrada: L vira principal (saindo de Y), E vira espelho; saldo de X não muda', () => {
    const e = plain(NUBANK, 1000, D, 'PIX recebido')
    const before = balance(NUBANK)
    importStatement(ITAU, [[-1000, D, 'PIX enviado']])

    expect(balance(NUBANK)).toBe(before)
    expect(balance(ITAU)).toBe(-1000)
    expect(db.find(t => t.id === e.id)).toMatchObject({ type: 'transfer', is_mirror: true, destination_account_id: ITAU })
    expect(db.find(t => t.account_id === ITAU)).toMatchObject({ type: 'transfer', is_mirror: false, destination_account_id: NUBANK })
  })
})

// ─── Pending → absorção ───────────────────────────────────────────────────────

describe('pending', () => {
  it('extrato do destino é absorvido pela perna sem extrato: sem linha nova, hash gravado, par matched', () => {
    importStatement(ITAU, [[-500, D, 'TED para Nubank']])
    expect(db).toHaveLength(2)
    expect(db.every(t => t.transfer_status === 'pending')).toBe(true)
    expect(balance(NUBANK)).toBe(500)

    const [d] = importStatement(NUBANK, [[500, D, 'TED recebida']])
    expect(d).toMatchObject({ status: 'matched', alreadyRecorded: true })
    expect(db).toHaveLength(2)
    expect(db.every(t => t.transfer_status === 'matched')).toBe(true)
    expect(db.find(t => t.account_id === NUBANK)!.import_hash).toBe(hash(500, D, 'TED recebida'))
    expect(balance(ITAU)).toBe(-500)
    expect(balance(NUBANK)).toBe(500)
  })

  it('transferência manual existente também absorve a linha do extrato', () => {
    apply([
      ...planCreatePair({ accountId: ITAU, amount: -200, date: D, description: 'Manual', importHash: null, bankTransactionId: null }, NUBANK, 'pm', 'matched'),
    ])
    const [d] = importStatement(ITAU, [[-200, D, 'TED enviada']])
    expect(d).toMatchObject({ status: 'matched', alreadyRecorded: true })
    expect(db).toHaveLength(2)
  })
})

// ─── Fatura de cartão ─────────────────────────────────────────────────────────

describe('fatura de cartão', () => {
  it('pagamento da fatura casa pelo Sinal A; compras do cartão continuam despesas', () => {
    plain(ITAU, -1500, D, 'PAGTO FATURA')
    const dets = importStatement(CARTAO_BTG, [
      [1500, D, 'Pagamento recebido'],
      [-120, D, 'Restaurante Bom Prato'],
    ])
    expect(dets[0].status).toBe('suggested')
    expect(dets[1].status).toBe('none')

    expect(db.filter(t => t.type === 'transfer')).toHaveLength(2)
    expect(db.filter(t => t.type === 'expense').map(t => t.description)).toEqual(['Restaurante Bom Prato'])
    expect(db.some(t => t.type === 'income')).toBe(false)
    expect(balance(ITAU)).toBe(-1500)
    expect(balance(CARTAO_BTG)).toBe(1500 - 120)
  })
})

// ─── Ordem de importação e reimportação ───────────────────────────────────────

describe('ordem de importação', () => {
  const extratoItau: Line[] = [[-1000, D, 'PIX enviado Nubank'], [-50, D, 'Padaria']]
  const extratoNubank: Line[] = [[1000, D, 'PIX recebido'], [-30, D, 'Uber']]

  function run(order: 'A→B' | 'B→A') {
    if (order === 'A→B') { importStatement(ITAU, extratoItau); importStatement(NUBANK, extratoNubank) }
    else { importStatement(NUBANK, extratoNubank); importStatement(ITAU, extratoItau) }
    return { snap: snapshot(), itau: balance(ITAU), nubank: balance(NUBANK) }
  }

  it('A→B e B→A chegam ao mesmo estado: um único par, sem receita nem despesa da transferência', () => {
    const ab = run('A→B')
    db = []
    const ba = run('B→A')

    expect(ab).toEqual(ba)
    expect(ab.itau).toBe(-1050)
    expect(ab.nubank).toBe(970)
    const transfers = ab.snap.filter(s => s.includes('|transfer|'))
    expect(transfers).toHaveLength(2)
    expect(transfers.every(s => s.includes('|matched|'))).toBe(true)
    expect(ab.snap.filter(s => s.includes('|1000|') && !s.includes('|transfer|'))).toHaveLength(0)
  })

  it('também sem Sinal B (só par espelhado), nas duas ordens', () => {
    const itau: Line[] = [[-1000, D, 'PIX enviado']]
    const nubank: Line[] = [[1000, D, 'PIX recebido']]
    importStatement(ITAU, itau); importStatement(NUBANK, nubank)
    const ab = snapshot()
    db = []
    importStatement(NUBANK, nubank); importStatement(ITAU, itau)
    expect(snapshot()).toEqual(ab)
    expect(ab.filter(s => s.includes('|transfer|'))).toHaveLength(2)
  })

  it('reimportar os mesmos arquivos não duplica nada', () => {
    run('A→B')
    const snap = snapshot()
    importStatement(ITAU, extratoItau)
    importStatement(NUBANK, extratoNubank)
    expect(snapshot()).toEqual(snap)
  })
})

// ─── Vínculo manual, desfazer e retroativo ────────────────────────────────────

describe('vínculo manual e retroativo', () => {
  it('vincular duas transações salvas preserva os saldos; desfazer também', () => {
    const out = plain(ITAU, -700, D, 'TED')
    const inn = plain(NUBANK, 700, D, 'TED recebida')
    const before = [balance(ITAU), balance(NUBANK)]

    apply(planLinkExisting(
      { id: inn.id, accountId: NUBANK, type: 'income' },
      { id: out.id, accountId: ITAU, type: 'expense' },
      'p1',
    ))
    expect([balance(ITAU), balance(NUBANK)]).toEqual(before)
    expect(db.find(t => t.id === out.id)).toMatchObject({ is_mirror: false, destination_account_id: NUBANK })

    apply(planUnlink(db.map(t => ({ id: t.id, isMirror: t.is_mirror }))))
    expect([balance(ITAU), balance(NUBANK)]).toEqual(before)
    expect(db.map(t => [t.type, t.category_id, t.transfer_pair_id])).toEqual([
      ['expense', null, null],
      ['income', null, null],
    ])
  })

  it('vincular uma transação salva a uma conta cria a outra perna (pending) sem mudar o saldo da origem', () => {
    const e = plain(ITAU, -400, D, 'TED')
    apply(planLinkToAccount({ id: e.id, accountId: ITAU, type: 'expense', date: D, amount: 400, description: 'TED' }, NUBANK, 'p1'))
    expect(balance(ITAU)).toBe(-400)
    expect(balance(NUBANK)).toBe(400)
    expect(db.every(t => t.transfer_status === 'pending')).toBe(true)

    const [d] = importStatement(NUBANK, [[400, D, 'TED recebida']])
    expect(d).toMatchObject({ status: 'matched', alreadyRecorded: true })
    expect(db).toHaveLength(2)
  })

  it('revisão retroativa propõe pares únicos e separa os ambíguos', () => {
    const o1 = plain(ITAU, -1000, D, 'TED Nubank')
    const i1 = plain(NUBANK, 1000, D, 'TED recebida')
    const o2 = plain(ITAU, -80, D, 'PIX')
    const i2 = plain(BTG, 80, D, 'PIX recebido')
    plain(NUBANK, 80, D, 'PIX recebido 2')

    const { proposals, ambiguous } = findHistoricalPairs(existing(), accounts)
    expect(proposals).toEqual([{ outId: o1.id, inId: i1.id, status: 'matched' }])
    expect(ambiguous).toContain(o2.id)
    expect(ambiguous).toContain(i2.id)
  })
})

// ─── Transferência órfã ───────────────────────────────────────────────────────

describe('transferência órfã', () => {
  function orphan(amount: number, transferAmount: number | null = null): DbRow {
    const row: DbRow = {
      id: `tx-${++seq}`, account_id: ITAU, type: 'transfer', amount, date: D, description: 'TED antiga',
      destination_account_id: null, transfer_pair_id: null, is_mirror: false, transfer_status: null,
      import_hash: null, bank_transaction_id: null, category_id: null, category_source: null,
      transfer_amount: transferAmount,
    }
    db.push(row)
    return row
  }

  it('definir a conta destino não muda o saldo da origem e cria o espelho matched', () => {
    const o = orphan(250)
    const before = balance(ITAU)
    expect(before).toBe(-250)

    apply(planCompleteOrphan(
      { id: o.id, accountId: ITAU, amount: 250, transferAmount: null, date: D, description: 'TED antiga' },
      NUBANK, 'p1',
    ))

    expect(balance(ITAU)).toBe(before)
    expect(balance(NUBANK)).toBe(250)
    expect(db.find(t => t.id === o.id)).toMatchObject({ destination_account_id: NUBANK, transfer_pair_id: 'p1', transfer_status: 'matched', is_mirror: false })
    expect(db.find(t => t.is_mirror)).toMatchObject({
      account_id: NUBANK, destination_account_id: ITAU, transfer_pair_id: 'p1', amount: 250, transfer_status: 'matched',
    })
  })

  it('com transfer_amount, o espelho e o crédito no destino usam o valor recebido', () => {
    const o = orphan(100, 98)
    apply(planCompleteOrphan(
      { id: o.id, accountId: ITAU, amount: 100, transferAmount: 98, date: D, description: null },
      NUBANK, 'p1',
    ))
    expect(balance(ITAU)).toBe(-100)
    expect(balance(NUBANK)).toBe(98)
    expect(db.find(t => t.is_mirror)!.amount).toBe(98)
  })
})
