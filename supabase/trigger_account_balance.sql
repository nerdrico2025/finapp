-- ─── Trigger: recalcula balance de accounts após operações em transactions ──────
--
-- Executa no Supabase SQL Editor.
-- Cobre income, expense e transfer (inclusive destination_account_id).
-- Usa initial_balance como ponto de partida.

-- 1. Helper: recalcula o balance de uma conta específica
CREATE OR REPLACE FUNCTION recalculate_account_balance(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.accounts
  SET balance = (
    SELECT
      COALESCE(a.initial_balance, 0) +
      COALESCE(SUM(
        CASE
          WHEN t.type = 'income'   AND t.account_id              = p_account_id THEN  t.amount
          WHEN t.type = 'expense'  AND t.account_id              = p_account_id THEN -t.amount
          WHEN t.type = 'transfer' AND t.account_id              = p_account_id THEN -t.amount
          WHEN t.type = 'transfer' AND t.destination_account_id  = p_account_id THEN  COALESCE(t.transfer_amount, t.amount)
          ELSE 0
        END
      ), 0)
    FROM public.accounts a
    LEFT JOIN public.transactions t
      ON t.account_id = p_account_id
      OR t.destination_account_id = p_account_id
    WHERE a.id = p_account_id
  )
  WHERE id = p_account_id;
END;
$$;

-- 2. Trigger function: determina quais contas recalcular
CREATE OR REPLACE FUNCTION trg_fn_update_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_account_balance(OLD.account_id);
    IF OLD.type = 'transfer' AND OLD.destination_account_id IS NOT NULL THEN
      PERFORM recalculate_account_balance(OLD.destination_account_id);
    END IF;
    RETURN OLD;
  END IF;

  -- INSERT ou UPDATE: recalcula conta do NEW
  PERFORM recalculate_account_balance(NEW.account_id);
  IF NEW.type = 'transfer' AND NEW.destination_account_id IS NOT NULL THEN
    PERFORM recalculate_account_balance(NEW.destination_account_id);
  END IF;

  -- UPDATE: se a conta origem mudou, recalcula a conta antiga também
  IF TG_OP = 'UPDATE' THEN
    IF OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      PERFORM recalculate_account_balance(OLD.account_id);
    END IF;
    IF OLD.type = 'transfer'
       AND OLD.destination_account_id IS NOT NULL
       AND OLD.destination_account_id IS DISTINCT FROM NEW.destination_account_id
    THEN
      PERFORM recalculate_account_balance(OLD.destination_account_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Criar o trigger (remove se já existir)
DROP TRIGGER IF EXISTS trg_update_account_balance ON public.transactions;

CREATE TRIGGER trg_update_account_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION trg_fn_update_account_balance();

-- 4. Recalcular AGORA todos os balances (corrige dados históricos)
UPDATE public.accounts a
SET balance = (
  SELECT
    COALESCE(a2.initial_balance, 0) +
    COALESCE(SUM(
      CASE
        WHEN t.type = 'income'   AND t.account_id             = a2.id THEN  t.amount
        WHEN t.type = 'expense'  AND t.account_id             = a2.id THEN -t.amount
        WHEN t.type = 'transfer' AND t.account_id             = a2.id THEN -t.amount
        WHEN t.type = 'transfer' AND t.destination_account_id = a2.id THEN  COALESCE(t.transfer_amount, t.amount)
        ELSE 0
      END
    ), 0)
  FROM public.accounts a2
  LEFT JOIN public.transactions t
    ON t.account_id = a2.id OR t.destination_account_id = a2.id
  WHERE a2.id = a.id
);

-- 5. Verificação: mostrar balances atualizados
SELECT
  name,
  initial_balance,
  balance,
  balance - initial_balance AS tx_sum
FROM public.accounts
WHERE is_active = true
ORDER BY name;
