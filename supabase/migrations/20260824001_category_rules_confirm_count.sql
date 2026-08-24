-- =============================================================================
-- MIGRATION: Contador de confirmações para auto-aplicação de categoria
-- Date: 2026-08-24
-- Description: Adiciona confirm_count a category_rules — conta quantas vezes
--              o usuário CONFIRMOU (submeteu) a mesma categoria para o mesmo
--              padrão de descrição, para permitir auto-aplicação sem exigir
--              confirmação manual quando confirm_count >= 3 (ver
--              AUTO_APPLY_CONFIRM_THRESHOLD em src/lib/actions/ai-categorization.ts).
--
--              Diferente de match_count (que conta toda vez que a regra é
--              consultada para gerar uma sugestão, inclusive só de o usuário
--              digitar a descrição): confirm_count só sobe quando a transação
--              é de fato salva com aquela categoria.
--
--              O DEFAULT 1 abaixo já preenche as linhas existentes com 1
--              confirmação implícita (a que criou a regra) — nenhuma regra
--              antiga passa a auto-aplicar sozinha; precisa acumular mais
--              2 confirmações reais primeiro.
-- =============================================================================

ALTER TABLE public.category_rules
  ADD COLUMN IF NOT EXISTS confirm_count integer NOT NULL DEFAULT 1;
