// Script temporário — NÃO precisa ser commitado.
//
// Verifica, só leitura, se as migrations pendentes (bank_transaction_id em
// transactions; type/frequency/next_date em bill_alerts; migração de dados
// recurring_rules -> bill_alerts) já foram aplicadas no banco.
//
// IMPORTANTE: @supabase/supabase-js fala com o PostgREST, que só expõe as
// tabelas do schema "public" (ver supabase/config.toml: schemas = ["public",
// "graphql_public"]) — não dá pra rodar um SELECT em information_schema por
// esse cliente. Em vez de consultar information_schema diretamente, cada
// checagem de coluna abaixo tenta fazer um .select() real da coluna: se a
// coluna não existe, o Postgres devolve o erro 42703 (undefined_column) e a
// gente interpreta isso como "migration ainda não rodou".
//
// Uso: node scripts/check-migrations.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')

function loadEnvLocal(filePath) {
  const env = {}
  let raw
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch {
    return env
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

const fileEnv = loadEnvLocal(envPath)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY

const rows = []

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltando credenciais em .env.local:')
  if (!SUPABASE_URL) console.error('  - NEXT_PUBLIC_SUPABASE_URL não encontrada')
  if (!SERVICE_ROLE_KEY) console.error('  - SUPABASE_SERVICE_ROLE_KEY não encontrada')
  console.error('\nNão dá pra rodar as checagens sem essas duas variáveis. Nada foi consultado.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function columnsExist(table, columns) {
  const { error } = await supabase.from(table).select(columns.join(', ')).limit(1)
  if (!error) return { ok: true }
  if (error.code === '42703') return { ok: false, missing: true }
  return { ok: false, missing: false, error: error.message }
}

async function countRows(table, filterFn) {
  let query = supabase.from(table).select('*', { count: 'exact', head: true })
  query = filterFn(query)
  const { count, error } = await query
  if (error) return { error: error.message }
  return { count }
}

// ── 1. transactions.bank_transaction_id ─────────────────────────────────────
const txCheck = await columnsExist('transactions', ['bank_transaction_id'])
rows.push({
  migration: '20260828001_transactions_bank_transaction_id',
  check: 'transactions.bank_transaction_id existe?',
  result: txCheck.ok ? 'SIM' : txCheck.missing ? 'NÃO (coluna não existe)' : `ERRO: ${txCheck.error}`,
})

// ── 2. bill_alerts.type / frequency / next_date ─────────────────────────────
const alertCols = ['type', 'frequency', 'next_date']
for (const col of alertCols) {
  const check = await columnsExist('bill_alerts', [col])
  rows.push({
    migration: '20260828002_bill_alerts_type_frequency',
    check: `bill_alerts.${col} existe?`,
    result: check.ok ? 'SIM' : check.missing ? 'NÃO (coluna não existe)' : `ERRO: ${check.error}`,
  })
}

// ── 3. Dados migrados de recurring_rules -> bill_alerts ─────────────────────
// Só faz sentido contar bill_alerts.type IS NOT NULL se a coluna já existir;
// senão o count viria de um erro 42703, não de "zero migrados".
const alertTypeExists = rows.some(r => r.check === 'bill_alerts.type existe?' && r.result === 'SIM')

if (alertTypeExists) {
  const withType = await countRows('bill_alerts', (q) => q.not('type', 'is', null))
  rows.push({
    migration: '20260828003_migrate_recurring_to_alerts',
    check: "bill_alerts com type preenchido (count)",
    result: withType.error ? `ERRO: ${withType.error}` : String(withType.count),
  })
} else {
  rows.push({
    migration: '20260828003_migrate_recurring_to_alerts',
    check: 'bill_alerts com type preenchido (count)',
    result: 'N/A — coluna type ainda não existe (rode a migration 002 primeiro)',
  })
}

const activeRules = await countRows('recurring_rules', (q) => q.eq('is_active', true))
rows.push({
  migration: '(referência)',
  check: 'recurring_rules ativas (count)',
  result: activeRules.error ? `ERRO: ${activeRules.error}` : String(activeRules.count),
})

// ── Report ───────────────────────────────────────────────────────────────────
const colWidths = {
  migration: Math.max(...rows.map(r => r.migration.length), 'migration'.length),
  check: Math.max(...rows.map(r => r.check.length), 'check'.length),
  result: Math.max(...rows.map(r => r.result.length), 'resultado'.length),
}

function pad(str, width) {
  return str + ' '.repeat(width - str.length)
}

console.log(pad('migration', colWidths.migration), '|', pad('check', colWidths.check), '|', pad('resultado', colWidths.result))
console.log('-'.repeat(colWidths.migration), '|', '-'.repeat(colWidths.check), '|', '-'.repeat(colWidths.result))
for (const r of rows) {
  console.log(pad(r.migration, colWidths.migration), '|', pad(r.check, colWidths.check), '|', pad(r.result, colWidths.result))
}
