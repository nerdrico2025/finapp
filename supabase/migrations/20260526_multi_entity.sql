-- =============================================================================
-- MIGRATION: Multi-Entity Support
-- Date: 2026-05-26
-- Description: Adds entities table and entity_id to all user-owned tables,
--              migrates existing data, updates RLS for backward compatibility.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Create entities table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entities (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        text        NOT NULL,
    type        text        NOT NULL CHECK (type IN ('personal', 'business')),
    cnpj        text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entities_owner_id_idx ON public.entities(owner_id);

-- -----------------------------------------------------------------------------
-- STEP 2: Migrate existing users — create one personal entity per user
--         Uses profiles.full_name when available, falls back to email prefix.
-- -----------------------------------------------------------------------------
INSERT INTO public.entities (owner_id, name, type, created_at)
SELECT
    u.id                                                    AS owner_id,
    COALESCE(NULLIF(TRIM(p.full_name), ''), SPLIT_PART(u.email, '@', 1), 'Pessoal') AS name,
    'personal'                                              AS type,
    u.created_at                                            AS created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- STEP 3: Add entity_id column to all user-owned tables
-- -----------------------------------------------------------------------------
ALTER TABLE public.accounts        ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;
ALTER TABLE public.categories      ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;
ALTER TABLE public.transactions    ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;
ALTER TABLE public.recurring_rules ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;
ALTER TABLE public.bill_alerts     ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;
ALTER TABLE public.budgets         ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;
ALTER TABLE public.goals           ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;
ALTER TABLE public.dream_lists     ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL;

-- Indexes for FK performance
CREATE INDEX IF NOT EXISTS accounts_entity_id_idx        ON public.accounts(entity_id);
CREATE INDEX IF NOT EXISTS categories_entity_id_idx      ON public.categories(entity_id);
CREATE INDEX IF NOT EXISTS transactions_entity_id_idx    ON public.transactions(entity_id);
CREATE INDEX IF NOT EXISTS recurring_rules_entity_id_idx ON public.recurring_rules(entity_id);
CREATE INDEX IF NOT EXISTS bill_alerts_entity_id_idx     ON public.bill_alerts(entity_id);
CREATE INDEX IF NOT EXISTS budgets_entity_id_idx         ON public.budgets(entity_id);
CREATE INDEX IF NOT EXISTS goals_entity_id_idx           ON public.goals(entity_id);
CREATE INDEX IF NOT EXISTS dream_lists_entity_id_idx     ON public.dream_lists(entity_id);

-- -----------------------------------------------------------------------------
-- STEP 4: Backfill entity_id using each row's user_id → personal entity
-- -----------------------------------------------------------------------------
UPDATE public.accounts        t SET entity_id = e.id FROM public.entities e WHERE e.owner_id = t.user_id AND e.type = 'personal' AND t.entity_id IS NULL;
UPDATE public.categories      t SET entity_id = e.id FROM public.entities e WHERE e.owner_id = t.user_id AND e.type = 'personal' AND t.entity_id IS NULL;
UPDATE public.transactions    t SET entity_id = e.id FROM public.entities e WHERE e.owner_id = t.user_id AND e.type = 'personal' AND t.entity_id IS NULL;
UPDATE public.recurring_rules t SET entity_id = e.id FROM public.entities e WHERE e.owner_id = t.user_id AND e.type = 'personal' AND t.entity_id IS NULL;
UPDATE public.bill_alerts     t SET entity_id = e.id FROM public.entities e WHERE e.owner_id = t.user_id AND e.type = 'personal' AND t.entity_id IS NULL;
UPDATE public.budgets         t SET entity_id = e.id FROM public.entities e WHERE e.owner_id = t.user_id AND e.type = 'personal' AND t.entity_id IS NULL;
UPDATE public.goals           t SET entity_id = e.id FROM public.entities e WHERE e.owner_id = t.user_id AND e.type = 'personal' AND t.entity_id IS NULL;
UPDATE public.dream_lists     t SET entity_id = e.id FROM public.entities e WHERE e.owner_id = t.user_id AND e.type = 'personal' AND t.entity_id IS NULL;

-- -----------------------------------------------------------------------------
-- STEP 5: Validation — assert zero rows with entity_id NULL after backfill.
--         If any DO block below raises, the migration must be re-investigated.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    null_count integer;
    tbl        text;
    tables     text[] := ARRAY[
        'accounts', 'categories', 'transactions', 'recurring_rules',
        'bill_alerts', 'budgets', 'goals', 'dream_lists'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE entity_id IS NULL AND user_id IS NOT NULL', tbl)
            INTO null_count;
        IF null_count > 0 THEN
            RAISE WARNING 'Table % has % row(s) with entity_id NULL after backfill', tbl, null_count;
        ELSE
            RAISE NOTICE 'OK: % — all rows have entity_id populated', tbl;
        END IF;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 6: Enable RLS on entities and add policies
-- -----------------------------------------------------------------------------
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

-- Owner can see their own entities
CREATE POLICY "entities_select_own"
    ON public.entities FOR SELECT
    USING (owner_id = auth.uid());

-- Owner can insert entities for themselves
CREATE POLICY "entities_insert_own"
    ON public.entities FOR INSERT
    WITH CHECK (owner_id = auth.uid());

-- Owner can update their own entities
CREATE POLICY "entities_update_own"
    ON public.entities FOR UPDATE
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- Owner can delete their own entities
CREATE POLICY "entities_delete_own"
    ON public.entities FOR DELETE
    USING (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- STEP 7: Update RLS on user-owned tables
--         Strategy: keep user_id check (backward compat) OR allow via entity
--         Helper function avoids repeating the subquery in every policy.
-- -----------------------------------------------------------------------------

-- Shared helper: returns ids of entities owned by the current user
CREATE OR REPLACE FUNCTION public.my_entity_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT id FROM public.entities WHERE owner_id = auth.uid();
$$;

-- ── accounts ──────────────────────────────────────────────────────────────────
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own accounts"     ON public.accounts;
DROP POLICY IF EXISTS "Users can insert own accounts"   ON public.accounts;
DROP POLICY IF EXISTS "Users can update own accounts"   ON public.accounts;
DROP POLICY IF EXISTS "Users can delete own accounts"   ON public.accounts;

CREATE POLICY "accounts_select" ON public.accounts FOR SELECT
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "accounts_insert" ON public.accounts FOR INSERT
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "accounts_update" ON public.accounts FOR UPDATE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()))
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "accounts_delete" ON public.accounts FOR DELETE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));

-- ── categories ────────────────────────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own categories"   ON public.categories;
DROP POLICY IF EXISTS "Users can insert own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can update own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can delete own categories" ON public.categories;

CREATE POLICY "categories_select" ON public.categories FOR SELECT
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "categories_insert" ON public.categories FOR INSERT
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "categories_update" ON public.categories FOR UPDATE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()))
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "categories_delete" ON public.categories FOR DELETE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));

-- ── transactions ──────────────────────────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own transactions"   ON public.transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;

CREATE POLICY "transactions_select" ON public.transactions FOR SELECT
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()))
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "transactions_delete" ON public.transactions FOR DELETE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));

-- ── recurring_rules ───────────────────────────────────────────────────────────
ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own recurring_rules"   ON public.recurring_rules;
DROP POLICY IF EXISTS "Users can insert own recurring_rules" ON public.recurring_rules;
DROP POLICY IF EXISTS "Users can update own recurring_rules" ON public.recurring_rules;
DROP POLICY IF EXISTS "Users can delete own recurring_rules" ON public.recurring_rules;

CREATE POLICY "recurring_rules_select" ON public.recurring_rules FOR SELECT
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "recurring_rules_insert" ON public.recurring_rules FOR INSERT
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "recurring_rules_update" ON public.recurring_rules FOR UPDATE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()))
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "recurring_rules_delete" ON public.recurring_rules FOR DELETE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));

-- ── bill_alerts ───────────────────────────────────────────────────────────────
ALTER TABLE public.bill_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own bill_alerts"   ON public.bill_alerts;
DROP POLICY IF EXISTS "Users can insert own bill_alerts" ON public.bill_alerts;
DROP POLICY IF EXISTS "Users can update own bill_alerts" ON public.bill_alerts;
DROP POLICY IF EXISTS "Users can delete own bill_alerts" ON public.bill_alerts;

CREATE POLICY "bill_alerts_select" ON public.bill_alerts FOR SELECT
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "bill_alerts_insert" ON public.bill_alerts FOR INSERT
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "bill_alerts_update" ON public.bill_alerts FOR UPDATE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()))
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "bill_alerts_delete" ON public.bill_alerts FOR DELETE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));

-- ── budgets ───────────────────────────────────────────────────────────────────
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own budgets"   ON public.budgets;
DROP POLICY IF EXISTS "Users can insert own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can update own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can delete own budgets" ON public.budgets;

CREATE POLICY "budgets_select" ON public.budgets FOR SELECT
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "budgets_insert" ON public.budgets FOR INSERT
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "budgets_update" ON public.budgets FOR UPDATE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()))
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "budgets_delete" ON public.budgets FOR DELETE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));

-- ── goals ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own goals"   ON public.goals;
DROP POLICY IF EXISTS "Users can insert own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can update own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can delete own goals" ON public.goals;

CREATE POLICY "goals_select" ON public.goals FOR SELECT
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "goals_insert" ON public.goals FOR INSERT
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "goals_update" ON public.goals FOR UPDATE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()))
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "goals_delete" ON public.goals FOR DELETE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));

-- ── dream_lists ───────────────────────────────────────────────────────────────
ALTER TABLE public.dream_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own dream lists" ON public.dream_lists;

CREATE POLICY "dream_lists_select" ON public.dream_lists FOR SELECT
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "dream_lists_insert" ON public.dream_lists FOR INSERT
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "dream_lists_update" ON public.dream_lists FOR UPDATE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()))
    WITH CHECK (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));
CREATE POLICY "dream_lists_delete" ON public.dream_lists FOR DELETE
    USING (user_id = auth.uid() OR entity_id IN (SELECT public.my_entity_ids()));

-- dream_items has no user_id; access is still through the dream_lists join.
-- The existing RLS policy remains valid as long as dream_lists is secured above.

-- -----------------------------------------------------------------------------
-- STEP 8: Trigger — auto-create personal entity on new user signup
--         Runs alongside (not replacing) the existing profiles trigger.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_entity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.entities (owner_id, name, type)
    VALUES (
        NEW.id,
        COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
            SPLIT_PART(NEW.email, '@', 1),
            'Pessoal'
        ),
        'personal'
    )
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_entity ON auth.users;
CREATE TRIGGER on_auth_user_created_entity
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_entity();

-- -----------------------------------------------------------------------------
-- STEP 9: Final validation query
--         Run this after applying the migration. All counts must be 0.
-- -----------------------------------------------------------------------------
SELECT
    'accounts'        AS tbl, COUNT(*) AS null_entity_rows FROM public.accounts        WHERE entity_id IS NULL AND user_id IS NOT NULL
UNION ALL SELECT 'categories',      COUNT(*) FROM public.categories      WHERE entity_id IS NULL AND user_id IS NOT NULL
UNION ALL SELECT 'transactions',    COUNT(*) FROM public.transactions    WHERE entity_id IS NULL AND user_id IS NOT NULL
UNION ALL SELECT 'recurring_rules', COUNT(*) FROM public.recurring_rules WHERE entity_id IS NULL AND user_id IS NOT NULL
UNION ALL SELECT 'bill_alerts',     COUNT(*) FROM public.bill_alerts     WHERE entity_id IS NULL AND user_id IS NOT NULL
UNION ALL SELECT 'budgets',         COUNT(*) FROM public.budgets         WHERE entity_id IS NULL AND user_id IS NOT NULL
UNION ALL SELECT 'goals',           COUNT(*) FROM public.goals           WHERE entity_id IS NULL AND user_id IS NOT NULL
UNION ALL SELECT 'dream_lists',     COUNT(*) FROM public.dream_lists     WHERE entity_id IS NULL AND user_id IS NOT NULL
ORDER BY tbl;
2