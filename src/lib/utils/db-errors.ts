/** Código Postgres de violação de unicidade (unique_violation). */
export const UNIQUE_VIOLATION = '23505'

/**
 * Erro do PostgREST/Supabase causado por um índice único — em transactions,
 * transactions_dedup_idx (user_id, account_id, import_hash) ou
 * transactions_user_bank_transaction_id_key (user_id, bank_transaction_id).
 */
export function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === UNIQUE_VIOLATION
}
