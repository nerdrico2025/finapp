-- =============================================================================
-- MIGRATION (dados): recurring_rules ativas → bill_alerts equivalentes
-- Date: 2026-08-28
-- Description: Cria um bill_alert para cada recurring_rule ATIVA de tipo
--              income/expense que ainda não tem um alerta vinculado. NÃO toca
--              em recurring_rules além de setar bill_alert_id (link de volta,
--              o mesmo campo que a tela de Recorrências já usa quando você
--              marca "criar alerta" manualmente) — nenhuma linha é apagada ou
--              desativada.
--
--              Pré-requisito: rode 20260828002_bill_alerts_type_frequency.sql
--              antes deste script.
--
--              Critérios de exclusão (linhas que NÃO são migradas automaticamente,
--              e por quê):
--                • type = 'transfer'        → recurring_rules aceita
--                  transferências, mas isso não é receita nem despesa —
--                  não há como mapear para o campo `type` novo de bill_alerts
--                  sem inventar um sentido que a regra não tem.
--                • bill_alert_id IS NOT NULL → a regra já tem um alerta
--                  vinculado (criado manualmente pela própria tela de
--                  Recorrências, via "criar alerta"). Migrar de novo criaria
--                  um alerta duplicado do mesmo lançamento.
--                • is_active = false         → fora do escopo pedido (só
--                  regras ativas); não é logada como "skipped" porque não é
--                  um caso ambíguo, é só fora do critério.
--
--              Todas as outras regras ativas de income/expense são migradas
--              automaticamente — não há caso de frequência ambígua, porque
--              bill_alerts.frequency foi desenhada (migration anterior) com
--              exatamente os mesmos 6 valores que recurring_rules.frequency
--              já usa.
--
--              Ressalva importante para sua revisão: next_date é copiado tal
--              como está em recurring_rules. Para regras com auto_create =
--              false, esse campo só avança quando alguém edita a data de
--              início — ou seja, pode estar no passado se a regra ficou muito
--              tempo sem edição. Isso não trava a migração (o Prompt 3/4 vai
--              recalcular a próxima ocorrência de verdade a partir daí), mas
--              o alerta migrado pode aparecer com uma data antiga até você
--              abrir/salvar ele uma vez na UI nova. A coluna
--              original_next_date no log abaixo mostra o next_date original
--              de cada regra migrada, para você notar esses casos.
--
--              Idempotente: pode rodar mais de uma vez sem duplicar — a
--              segunda execução não encontra regras elegíveis (todas já têm
--              bill_alert_id preenchido pela primeira).
-- =============================================================================

-- ── 0. Tabela de log — só para você conferir o resultado, RLS fechado por
--      padrão (deny-all: sem policies) para não vazar nomes/valores de
--      alertas de um usuário para outro via a API pública do Supabase. ──────
CREATE TABLE IF NOT EXISTS public._recurring_to_alert_migration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_rule_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rule_name text,
  status text NOT NULL, -- 'migrated' | 'skipped'
  reason text,
  bill_alert_id uuid,
  original_next_date date,
  migrated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public._recurring_to_alert_migration_log ENABLE ROW LEVEL SECURITY;

-- ── 1. Loga primeiro as regras ativas que ficam de fora, com o motivo ───────
-- Importante rodar ANTES do passo de migração: o passo 2 atualiza
-- recurring_rules.bill_alert_id das regras migradas, então se esta consulta
-- rodasse depois ela pegaria erroneamente as regras recém-migradas também
-- (elas passam a ter bill_alert_id IS NOT NULL) e logaria como "skipped" algo
-- que já está em "migrated".
INSERT INTO public._recurring_to_alert_migration_log
  (recurring_rule_id, user_id, rule_name, status, reason, bill_alert_id, original_next_date)
SELECT
  r.id,
  r.user_id,
  r.name,
  'skipped',
  CASE
    WHEN r.type = 'transfer' THEN 'type=transfer — não é receita nem despesa, sem mapeamento para bill_alerts.type'
    WHEN r.bill_alert_id IS NOT NULL THEN 'já tem bill_alert_id vinculado — provavelmente criado manualmente na tela de Recorrências, migrar de novo duplicaria'
  END,
  r.bill_alert_id,
  r.next_date
FROM public.recurring_rules r
WHERE r.is_active = true
  AND (r.type = 'transfer' OR r.bill_alert_id IS NOT NULL)
  -- Guarda de idempotência: não relogue uma regra que uma execução anterior
  -- deste script já processou — em QUALQUER status. Sem o "em qualquer
  -- status", uma regra migrada numa execução anterior (que por isso passou a
  -- ter bill_alert_id preenchido) bateria de novo no filtro acima e seria
  -- logada como "skipped" indevidamente, além do "migrated" que já tem.
  AND NOT EXISTS (
    SELECT 1 FROM public._recurring_to_alert_migration_log l
    WHERE l.recurring_rule_id = r.id
  );

-- ── 2. Migra as regras elegíveis, cria o bill_alert, linka de volta e loga ──
--
-- Nota técnica: cada CTE abaixo é encadeada na anterior por uma referência
-- de verdade (não só via "eligible" em paralelo) — no Postgres, um INSERT/
-- UPDATE dentro de WITH só tem garantia de ser executado se estiver
-- referenciado (direta ou transitivamente) pela query principal. Encadear
-- ins_alerts → upd_rules → INSERT final evita depender desse detalhe.
WITH eligible AS (
  SELECT
    r.*,
    gen_random_uuid() AS new_alert_id
  FROM public.recurring_rules r
  WHERE r.is_active = true
    AND r.type IN ('income', 'expense')
    AND r.bill_alert_id IS NULL
),
ins_alerts AS (
  INSERT INTO public.bill_alerts (
    id, user_id, entity_id, name, amount, type, frequency, next_date,
    day_of_month, days_before, end_date, is_active
  )
  SELECT
    e.new_alert_id,
    e.user_id,
    e.entity_id,
    e.name,
    e.amount,
    e.type,
    e.frequency,
    e.next_date,
    CASE WHEN e.frequency = 'monthly' THEN EXTRACT(DAY FROM e.next_date)::int END,
    3,                 -- mesmo default de days_before usado na criação manual de alerta
    e.end_date,
    true
  FROM eligible e
  RETURNING id AS alert_id
),
upd_rules AS (
  UPDATE public.recurring_rules r
  SET bill_alert_id = e.new_alert_id
  FROM eligible e
  JOIN ins_alerts ia ON ia.alert_id = e.new_alert_id
  WHERE r.id = e.id
  RETURNING r.id AS recurring_rule_id, e.user_id, e.name, e.new_alert_id AS bill_alert_id, e.next_date
)
INSERT INTO public._recurring_to_alert_migration_log
  (recurring_rule_id, user_id, rule_name, status, reason, bill_alert_id, original_next_date)
SELECT recurring_rule_id, user_id, name, 'migrated', NULL, bill_alert_id, next_date
FROM upd_rules;

-- ── 3. Resultado — rode estas duas queries para conferir ────────────────────
SELECT status, count(*) AS total
FROM public._recurring_to_alert_migration_log
GROUP BY status
ORDER BY status;

SELECT *
FROM public._recurring_to_alert_migration_log
ORDER BY status, rule_name;
