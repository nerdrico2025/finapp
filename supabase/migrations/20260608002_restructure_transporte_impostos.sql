-- =============================================================================
-- MIGRATION: Reestruturação — Transporte, Moradia e Impostos e Taxas
-- Date: 2026-06-08
-- Changes:
--   1. Cria categoria pai "Transporte" em cada entidade PF (se não existir)
--   2. Move "IPVA e seguro auto" de Moradia → Transporte
--   3. Garante subcategorias de Transporte: Combustível, Estacionamento e
--      pedágio, Manutenção do veículo, IPVA e seguro auto
--   4. Adiciona "Manutenção da casa" em Moradia (se ausente)
--   5. Adiciona IPTU e IOF em Impostos e Taxas (se ausentes)
--   6. Atualiza ícone de Impostos e Taxas para 🏛️
-- Todas as inserções verificam existência — idempotente.
-- =============================================================================

DO $$
DECLARE
  ent          RECORD;
  uid          uuid;
  eid          uuid;
  pid_moradia  uuid;
  pid_transp   uuid;
  pid_impostos uuid;
  ipva_id      uuid;
BEGIN
  FOR ent IN
    SELECT e.id AS entity_id, e.owner_id AS user_id
    FROM   public.entities e
    WHERE  e.type = 'personal'
  LOOP
    uid := ent.user_id;
    eid := ent.entity_id;

    -- ── Obtém IDs das categorias pai existentes ──────────────────────────────

    SELECT id INTO pid_moradia
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid
      AND name = 'Moradia' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    SELECT id INTO pid_impostos
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid
      AND name = 'Impostos e Taxas' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    -- ── 1. Cria Transporte se não existir ────────────────────────────────────

    SELECT id INTO pid_transp
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid
      AND name = 'Transporte' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_transp IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Transporte', 'expense', '🚗', '#3b82f6', false, null)
      RETURNING id INTO pid_transp;
    END IF;

    -- ── 2. Move "IPVA e seguro auto" de Moradia → Transporte ─────────────────

    IF pid_moradia IS NOT NULL AND pid_transp IS NOT NULL THEN
      UPDATE public.categories
      SET parent_id = pid_transp
      WHERE user_id = uid AND entity_id = eid
        AND name = 'IPVA e seguro auto' AND type = 'expense'
        AND parent_id = pid_moradia;
    END IF;

    -- ── 3. Garante subcategorias de Transporte ───────────────────────────────

    IF pid_transp IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#3b82f6', false, pid_transp
      FROM (VALUES
        ('Combustível',              '⛽'),
        ('Estacionamento e pedágio', '🅿️'),
        ('Manutenção do veículo',    '🔧'),
        ('IPVA e seguro auto',       '📋')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_transp
      );
    END IF;

    -- ── 4. Adiciona "Manutenção da casa" em Moradia ──────────────────────────

    IF pid_moradia IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, 'Manutenção da casa', 'expense', '🔧', '#8b5cf6', false, pid_moradia
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = 'Manutenção da casa' AND c2.type = 'expense' AND c2.parent_id = pid_moradia
      );
    END IF;

    -- ── 5. Adiciona IPTU e IOF em Impostos e Taxas ───────────────────────────

    IF pid_impostos IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#64748b', false, pid_impostos
      FROM (VALUES
        ('IPTU',             '🏘️'),
        ('IOF',              '💸'),
        ('Imposto de Renda', '📄'),
        ('Outras taxas',     '📋')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_impostos
      );

      -- Atualiza ícone da categoria pai
      UPDATE public.categories
      SET icon = '🏛️'
      WHERE id = pid_impostos AND icon <> '🏛️';
    END IF;

  END LOOP;
END $$;
