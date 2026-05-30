-- Add all transfer-related columns (some may not exist yet in the live DB)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS destination_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_amount numeric(15,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_pair_id uuid;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_mirror boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_transactions_transfer_pair_id
  ON transactions(transfer_pair_id) WHERE transfer_pair_id IS NOT NULL;

-- Update recalculate_account_balance to skip mirror records
-- Mirror records exist only for display; the PRIMARY record drives both balance changes.
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
          WHEN t.is_mirror THEN 0
          WHEN t.type = 'income'   AND t.account_id             = p_account_id THEN  t.amount
          WHEN t.type = 'expense'  AND t.account_id             = p_account_id THEN -t.amount
          WHEN t.type = 'transfer' AND t.account_id             = p_account_id THEN -t.amount
          WHEN t.type = 'transfer' AND t.destination_account_id = p_account_id THEN  COALESCE(t.transfer_amount, t.amount)
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

-- Trigger function stays the same; it calls recalculate_account_balance which now
-- handles is_mirror. Recreate to pick up any stale cached plan.
CREATE OR REPLACE FUNCTION trg_fn_update_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_account_balance(OLD.account_id);
    IF OLD.type = 'transfer' AND OLD.destination_account_id IS NOT NULL AND NOT OLD.is_mirror THEN
      PERFORM recalculate_account_balance(OLD.destination_account_id);
    END IF;
    RETURN OLD;
  END IF;

  PERFORM recalculate_account_balance(NEW.account_id);
  IF NEW.type = 'transfer' AND NEW.destination_account_id IS NOT NULL AND NOT NEW.is_mirror THEN
    PERFORM recalculate_account_balance(NEW.destination_account_id);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      PERFORM recalculate_account_balance(OLD.account_id);
    END IF;
    IF OLD.type = 'transfer'
       AND OLD.destination_account_id IS NOT NULL
       AND NOT OLD.is_mirror
       AND OLD.destination_account_id IS DISTINCT FROM NEW.destination_account_id
    THEN
      PERFORM recalculate_account_balance(OLD.destination_account_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recalculate all balances to account for the new logic
UPDATE public.accounts a
SET balance = (
  SELECT
    COALESCE(a2.initial_balance, 0) +
    COALESCE(SUM(
      CASE
        WHEN t.is_mirror THEN 0
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
