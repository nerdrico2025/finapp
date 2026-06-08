-- ─── 1. Coluna total_contributed em accounts ─────────────────────────────────
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS total_contributed numeric(15,2) NOT NULL DEFAULT 0;

-- ─── 2. Categoria "Rendimentos" por entidade ──────────────────────────────────
INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default)
SELECT
  e.owner_id,
  e.id,
  'Rendimentos',
  'income',
  '📈',
  '#1D9E75',
  true
FROM public.entities e
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c
  WHERE c.entity_id = e.id AND c.name = 'Rendimentos'
);

-- ─── 3. Popular total_contributed com dados existentes ───────────────────────
-- Exclui transações da categoria "Rendimentos" (rentabilidade não é aporte)
UPDATE public.accounts a
SET total_contributed = COALESCE((
  SELECT SUM(
    CASE
      WHEN t.type = 'income'  THEN  t.amount
      WHEN t.type = 'expense' THEN -t.amount
      ELSE 0
    END
  )
  FROM public.transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE t.account_id = a.id
    AND t.is_mirror = false
    AND t.type IN ('income', 'expense')
    AND (c.name IS NULL OR c.name != 'Rendimentos')
), 0)
WHERE a.type = 'investment';

-- ─── 4. Função para recalcular total_contributed ──────────────────────────────
CREATE OR REPLACE FUNCTION recalculate_account_contributed(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.accounts
  SET total_contributed = COALESCE((
    SELECT SUM(
      CASE
        WHEN t.type = 'income'  THEN  t.amount
        WHEN t.type = 'expense' THEN -t.amount
        ELSE 0
      END
    )
    FROM public.transactions t
    LEFT JOIN public.categories c ON c.id = t.category_id
    WHERE t.account_id = p_account_id
      AND t.is_mirror = false
      AND t.type IN ('income', 'expense')
      AND (c.name IS NULL OR c.name != 'Rendimentos')
  ), 0)
  WHERE id = p_account_id
    AND type = 'investment';
END;
$$;

-- ─── 5. Trigger para manter total_contributed atualizado ──────────────────────
CREATE OR REPLACE FUNCTION trg_fn_update_contributed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_account_contributed(OLD.account_id);
    RETURN OLD;
  END IF;

  PERFORM recalculate_account_contributed(NEW.account_id);

  IF TG_OP = 'UPDATE' AND OLD.account_id IS DISTINCT FROM NEW.account_id THEN
    PERFORM recalculate_account_contributed(OLD.account_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_contributed ON public.transactions;
CREATE TRIGGER trg_update_contributed
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION trg_fn_update_contributed();
