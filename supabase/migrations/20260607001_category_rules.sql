-- =============================================================================
-- MIGRATION: Tabela de regras de auto-categorização aprendidas
-- Date: 2026-06-07
-- Description: Armazena padrões aprendidos por entidade. Cada vez que o
--              usuário confirma uma sugestão da IA a regra é salva/atualizada
--              para uso offline na próxima vez que o mesmo payee aparecer.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.category_rules (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    uuid        REFERENCES public.entities(id)       ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  -- Descrição normalizada (lowercase, sem pontuação especial)
  -- Ex: "UBER *TRIP BR" → "uber trip br"
  pattern      text        NOT NULL,
  category_id  uuid        NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  match_count  integer     NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Unicidade por entidade + padrão (ou por usuário quando entity_id é null)
CREATE UNIQUE INDEX IF NOT EXISTS category_rules_entity_pattern_uidx
  ON public.category_rules (entity_id, pattern)
  WHERE entity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS category_rules_user_pattern_uidx
  ON public.category_rules (user_id, pattern)
  WHERE entity_id IS NULL;

CREATE INDEX IF NOT EXISTS category_rules_entity_id_idx  ON public.category_rules (entity_id);
CREATE INDEX IF NOT EXISTS category_rules_user_id_idx    ON public.category_rules (user_id);
CREATE INDEX IF NOT EXISTS category_rules_category_id_idx ON public.category_rules (category_id);

-- RLS
ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário lê suas próprias regras"     ON public.category_rules;
DROP POLICY IF EXISTS "Usuário insere suas próprias regras" ON public.category_rules;
DROP POLICY IF EXISTS "Usuário atualiza suas próprias regras" ON public.category_rules;
DROP POLICY IF EXISTS "Usuário exclui suas próprias regras" ON public.category_rules;

CREATE POLICY "Usuário lê suas próprias regras"
  ON public.category_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuário insere suas próprias regras"
  ON public.category_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário atualiza suas próprias regras"
  ON public.category_rules FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário exclui suas próprias regras"
  ON public.category_rules FOR DELETE
  USING (auth.uid() = user_id);
