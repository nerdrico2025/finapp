-- =============================================================================
-- MIGRATION: Origem da categorização de cada transação
-- Date: 2026-08-24
-- Description: Adiciona category_source a transactions — registra COMO a
--              categoria da transação foi definida:
--                'manual'     → usuário escolheu diretamente (ou trocou uma
--                               sugestão), inclusive linhas de import editadas
--                               à mão
--                'rule'       → sugestão do Tier 1 (category_rules aprendida,
--                               ainda abaixo do threshold de auto-aplicação)
--                'ai'         → sugestão do Tier 2 (DeepSeek)
--                'keyword'    → sugestão do Tier 3 (dicionário embutido)
--                'auto'       → Tier 1 auto-aplicado (confirm_count alto —
--                               ver Prompt 2 / AUTO_APPLY_CONFIRM_THRESHOLD)
--                'propagated' → aplicado pela propagação retroativa de uma
--                               correção feita em outra transação
--                NULL         → dado anterior a esta coluna existir, ou
--                               transação gerada por regra recorrente
--                               (recurring_rules) — provenance desconhecida
--
--              Usado por propagateCorrection() (src/lib/actions/ai-categorization.ts)
--              para decidir quais transações passadas ainda "não foram
--              revisadas" por um humano e por isso podem ser sobrescritas
--              quando o usuário corrige uma transação parecida. Transações
--              com category_source NULL (todo o histórico anterior a esta
--              migration) ficam automaticamente FORA do alcance da
--              propagação — comportamento seguro por padrão, sem precisar
--              de backfill.
-- =============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS category_source text
  CHECK (category_source IS NULL OR category_source IN ('manual', 'rule', 'ai', 'keyword', 'auto', 'propagated'));

-- Acelera a query de candidatos da propagação retroativa (filtra por usuário,
-- fontes elegíveis e janela de datas antes de comparar o padrão em memória).
CREATE INDEX IF NOT EXISTS transactions_category_source_idx
  ON public.transactions (user_id, category_source, date);
