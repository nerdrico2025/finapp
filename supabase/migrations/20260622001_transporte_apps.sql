-- =============================================================================
-- MIGRATION: Adiciona subcategoria "Aplicativos de transporte" (Uber/99) em
--            Transporte para cada entidade PF existente.
-- Date: 2026-06-22
-- Idempotente — só insere se ainda não existir.
-- =============================================================================

DO $$
DECLARE
  ent        RECORD;
  uid        uuid;
  eid        uuid;
  pid_transp uuid;
BEGIN
  FOR ent IN
    SELECT e.id AS entity_id, e.owner_id AS user_id
    FROM   public.entities e
    WHERE  e.type = 'personal'
  LOOP
    uid := ent.user_id;
    eid := ent.entity_id;

    -- Garante a categoria pai "Transporte" (cria se não existir)
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

    -- Adiciona a subcategoria se ainda não existir
    INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
    SELECT uid, eid, 'Aplicativos de transporte', 'expense', '🚕', '#3b82f6', false, pid_transp
    WHERE NOT EXISTS (
      SELECT 1 FROM public.categories c2
      WHERE c2.user_id = uid AND c2.entity_id = eid
        AND c2.name = 'Aplicativos de transporte'
        AND c2.type = 'expense' AND c2.parent_id = pid_transp
    );

  END LOOP;
END $$;
