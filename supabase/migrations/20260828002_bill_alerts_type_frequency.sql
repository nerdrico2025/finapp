-- =============================================================================
-- MIGRATION: bill_alerts ganha tipo (receita/despesa) e frequência
-- Date: 2026-08-28
-- Description: Prepara bill_alerts para substituir recurring_rules como única
--              fonte de "coisas que vão acontecer" no app (ver Prompt 2, que
--              remove Recorrências por completo, e Prompt 4, tela /previsao).
--
--              Colunas novas:
--                type        'income' | 'expense' — hoje bill_alerts só
--                            servia para despesas (contas a pagar); passa a
--                            suportar também alertas de receita esperada.
--                            NOT NULL, default 'expense' (todo alerta
--                            existente hoje É uma despesa).
--                frequency   mesmos 6 valores que recurring_rules.frequency
--                            já usa: daily/weekly/biweekly/monthly/quarterly/
--                            yearly. NOT NULL, default 'monthly' (todo alerta
--                            existente hoje é implicitamente mensal, via
--                            day_of_month).
--                next_date   "próxima ocorrência" no mesmo espírito de
--                            recurring_rules.next_date — serve de âncora para
--                            calcular a próxima data quando frequency é
--                            diária/semanal/quinzenal/trimestral/anual, caso
--                            em que day_of_month não faz sentido sozinho.
--                            Nullable de propósito: para alertas mensais
--                            existentes, day_of_month continua sendo o campo
--                            usado (ver Prompt 3) — next_date fica NULL até
--                            que a UI passe a gravá-lo, ou é preenchido
--                            direto pela migração de recurring_rules (script
--                            separado, mais abaixo) para as frequências
--                            não-mensais.
--
--              day_of_month deixa de ser obrigatório: só faz sentido para
--              frequency = 'monthly' (mantido intocado — mesmo tipo, mesmo
--              nome — para não quebrar o código atual antes do Prompt 3
--              atualizar a UI/lógica).
--
--              Nenhum dado existente é reescrito além dos defaults abaixo —
--              is_active, days_before, end_date, google_event_id e
--              google_reminder_event_id continuam exatamente como estão.
-- =============================================================================

ALTER TABLE public.bill_alerts
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'expense'
    CHECK (type IN ('income', 'expense')),
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  ADD COLUMN IF NOT EXISTS next_date date;

ALTER TABLE public.bill_alerts
  ALTER COLUMN day_of_month DROP NOT NULL;

-- Acelera a tela de previsão (Prompt 4): "alertas ativos cuja próxima
-- ocorrência cai no mês selecionado" filtra por is_active + type + next_date.
CREATE INDEX IF NOT EXISTS bill_alerts_active_next_date_idx
  ON public.bill_alerts (user_id, is_active, next_date)
  WHERE is_active = true;
