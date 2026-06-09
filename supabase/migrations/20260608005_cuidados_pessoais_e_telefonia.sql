-- =============================================================================
-- MIGRATION: Cuidados Pessoais + renomeia Internet → Telefonia e internet
-- Date: 2026-06-08
-- Changes:
--   1. Renomeia subcategoria "Internet" de Moradia para "Telefonia e internet"
--   2. Cria categoria pai "Cuidados Pessoais" (💅, #f472b6) se não existir
--   3. Adiciona subcategorias: Salão e estética, Farmácia e higiene,
--      Academia e saúde, Vestuário e acessórios
-- Idempotente: usa UPDATE com WHERE e INSERT ... WHERE NOT EXISTS.
-- Aplica apenas em entidades do tipo 'personal'.
-- =============================================================================

DO $$
DECLARE
  ent         RECORD;
  uid         uuid;
  eid         uuid;
  pid_moradia uuid;
  pid_cuidados uuid;
BEGIN
  FOR ent IN
    SELECT e.id AS entity_id, e.owner_id AS user_id
    FROM   public.entities e
    WHERE  e.type = 'personal'
  LOOP
    uid := ent.user_id;
    eid := ent.entity_id;

    -- ── 1. Renomeia Internet → Telefonia e internet em Moradia ─────────────────

    SELECT id INTO pid_moradia
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid
      AND name = 'Moradia' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_moradia IS NOT NULL THEN
      UPDATE public.categories
      SET name = 'Telefonia e internet'
      WHERE user_id = uid AND entity_id = eid
        AND name = 'Internet' AND type = 'expense' AND parent_id = pid_moradia;
    END IF;

    -- ── 2. Cria Cuidados Pessoais se não existir ────────────────────────────────

    SELECT id INTO pid_cuidados
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid
      AND name = 'Cuidados Pessoais' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_cuidados IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Cuidados Pessoais', 'expense', '💅', '#f472b6', false, null)
      RETURNING id INTO pid_cuidados;
    END IF;

    -- ── 3. Adiciona subcategorias de Cuidados Pessoais ──────────────────────────

    IF pid_cuidados IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#f472b6', false, pid_cuidados
      FROM (VALUES
        ('Salão e estética',       '💇'),
        ('Farmácia e higiene',     '🧴'),
        ('Academia e saúde',       '🏋️'),
        ('Vestuário e acessórios', '👗')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_cuidados
      );
    END IF;

  END LOOP;
END $$;
