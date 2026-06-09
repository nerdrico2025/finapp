-- =============================================================================
-- MIGRATION: Reorganiza "Rendimentos" → "Outros rendimentos" como subcategoria
-- Date: 2026-06-08
-- Changes:
--   Para cada entidade listada abaixo, renomeia a categoria "Rendimentos"
--   (que era pai sem parent_id) para "Outros rendimentos" e a torna
--   subcategoria do mesmo pai de "Rendimentos de investimentos".
--
--   Entidades tratadas: 122cdf6d, 51eb58f5, 8b29eff0, bb4c6340
--   Entidade afd52425: UUID do pai truncado — precisa correção manual
--   Entidade 28f1209a: diagnóstico emitido via RAISE NOTICE abaixo
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN

  -- ── Entidade 122cdf6d ───────────────────────────────────────────────────────
  UPDATE public.categories
  SET name = 'Outros rendimentos',
      parent_id = 'a7921601-0c92-4b15-acdb-8b2d4d3b86d4'
  WHERE id = '8dfef181-8d4c-402e-8cf3-3c05daf96440';

  -- ── Entidade 51eb58f5 ───────────────────────────────────────────────────────
  UPDATE public.categories
  SET name = 'Outros rendimentos',
      parent_id = 'b5f8e237-1f81-41ee-abfc-f61d20e36f89'
  WHERE id = '413dceb6-d2bf-41c0-a12e-a2ba63d9b427';

  -- ── Entidade 8b29eff0 ───────────────────────────────────────────────────────
  UPDATE public.categories
  SET name = 'Outros rendimentos',
      parent_id = 'aadd7cae-d8d5-4cee-8da7-ae8a9992a538'
  WHERE id = 'c0600c1b-13dc-46a2-a2e8-bb8f0a4ecf37';

  -- ── Entidade bb4c6340 ───────────────────────────────────────────────────────
  UPDATE public.categories
  SET name = 'Outros rendimentos',
      parent_id = '35f154ab-0e56-43e9-aac9-f7e749f81f30'
  WHERE id = 'cd51fb3c-deeb-4186-9d89-df4dcd10a955';

  -- ── Entidade afd52425 — UUID truncado, precisa completar manualmente ────────
  -- UPDATE public.categories
  -- SET name = 'Outros rendimentos',
  --     parent_id = 'a6b21a98-d8b8-403c-bf50-????'  -- completar UUID
  -- WHERE id = 'b2c2b2c3-5d8d-4903-9adc-b42b95025837';

  -- ── Entidade 28f1209a — diagnóstico: mostra pais de receita ────────────────
  FOR r IN
    SELECT id, name
    FROM public.categories
    WHERE entity_id = '28f1209a-a0fb-4c9c-b67d-f8e452c355f5'
      AND type = 'income'
      AND parent_id IS NULL
  LOOP
    RAISE NOTICE 'ENTIDADE 28f1209a — pai income: id=% name=%', r.id, r.name;
  END LOOP;

END $$;
