-- =============================================================================
-- MIGRATION: Remove categorias de receita duplicadas
-- Date: 2026-06-08
-- Description: A migration 20260607002_subcategories_pf pode ter criado
--              subcategorias duplicadas quando rodada em entidades que já
--              tinham categorias de receita com o mesmo nome.
--              Este script identifica duplicatas (mesmo name + parent_id +
--              entity_id + type), mantém a mais antiga, remapeia transações
--              e budgets, e deleta os registros redundantes.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN

  -- ── 1. Remapeia transações que apontam para uma categoria duplicada ──────────
  FOR r IN
    WITH ranked AS (
      SELECT
        id,
        name,
        parent_id,
        entity_id,
        type,
        ROW_NUMBER() OVER (
          PARTITION BY name, COALESCE(parent_id::text, 'NULL'), entity_id, type
          ORDER BY created_at ASC
        ) AS rn,
        FIRST_VALUE(id) OVER (
          PARTITION BY name, COALESCE(parent_id::text, 'NULL'), entity_id, type
          ORDER BY created_at ASC
        ) AS keep_id
      FROM public.categories
    )
    SELECT id AS dup_id, keep_id
    FROM ranked
    WHERE rn > 1
  LOOP
    -- Redireciona transações para a categoria que será mantida
    UPDATE public.transactions
    SET category_id = r.keep_id
    WHERE category_id = r.dup_id;

    -- Redireciona budgets
    UPDATE public.budgets
    SET category_id = r.keep_id
    WHERE category_id = r.dup_id;

    -- Redireciona category_rules
    UPDATE public.category_rules
    SET category_id = r.keep_id
    WHERE category_id = r.dup_id;
  END LOOP;

  -- ── 2. Deleta as categorias duplicadas (mantém a mais antiga de cada grupo) ──
  DELETE FROM public.categories
  WHERE id IN (
    SELECT id
    FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY name, COALESCE(parent_id::text, 'NULL'), entity_id, type
          ORDER BY created_at ASC
        ) AS rn
      FROM public.categories
    ) ranked
    WHERE rn > 1
  );

END $$;
