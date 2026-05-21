-- Fix transactions geradas incorretamente em 20/05/2026
-- Corrige category_id e account_id a partir da recurring_rule correspondente
-- Ajusta saldos quando account_id muda

DO $$
DECLARE
  tx RECORD;
  delta NUMERIC;
BEGIN
  FOR tx IN
    SELECT
      t.id,
      t.type,
      t.amount,
      t.account_id        AS old_account_id,
      t.category_id       AS old_category_id,
      r.account_id        AS correct_account_id,
      r.category_id       AS correct_category_id
    FROM transactions t
    JOIN recurring_rules r ON r.id = t.recurring_rule_id
    WHERE t.description IN ('Fixo Vendedor Mestre', 'Financiamento Apartamento')
      AND t.date = '2026-05-20'
  LOOP
    -- 1. Corrige category_id (sem impacto em saldo)
    UPDATE transactions
    SET category_id = tx.correct_category_id
    WHERE id = tx.id;

    -- 2. Corrige account_id com ajuste de saldo (apenas se diferente)
    IF tx.old_account_id IS DISTINCT FROM tx.correct_account_id THEN
      delta := CASE tx.type
        WHEN 'income'  THEN  tx.amount
        WHEN 'expense' THEN -tx.amount
        ELSE 0
      END;

      -- Reverte saldo da conta errada
      UPDATE accounts SET balance = balance - delta WHERE id = tx.old_account_id;

      -- Aplica saldo na conta correta
      UPDATE accounts SET balance = balance + delta WHERE id = tx.correct_account_id;

      -- Atualiza account_id na transação
      UPDATE transactions SET account_id = tx.correct_account_id WHERE id = tx.id;
    END IF;

    RAISE NOTICE 'Fixed transaction % → category_id: % → %, account_id: % → %',
      tx.id,
      tx.old_category_id, tx.correct_category_id,
      tx.old_account_id,  tx.correct_account_id;
  END LOOP;
END $$;
