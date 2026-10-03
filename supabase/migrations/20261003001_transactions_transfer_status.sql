-- Status de vínculo das transferências entre contas próprias.
--   matched   = par confirmado (as duas pernas conferidas / criado manualmente)
--   pending   = par criado com destino conhecido, extrato do destino ainda não importado
--   suggested = par proposto pelo Sinal A com candidato único, aguardando confirmação
-- O par continua sendo modelado por transfer_pair_id / destination_account_id / is_mirror;
-- a trigger de saldo não é alterada.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_status text NULL;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transfer_status_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_transfer_status_check
  CHECK (transfer_status IS NULL OR transfer_status IN ('matched', 'pending', 'suggested'));

CREATE INDEX IF NOT EXISTS idx_transactions_user_transfer_status
  ON transactions(user_id, transfer_status);

-- Backfill: transferências existentes (manuais) são pares confirmados.
UPDATE transactions SET transfer_status = 'matched' WHERE type = 'transfer';

NOTIFY pgrst, 'reload schema';
