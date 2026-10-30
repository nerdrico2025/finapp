-- Módulo de Opções, Fase 1: posição, strike e ciclo de vida em trade_operations.
--   position                     = titular (holder) ou lançador (writer). Registros antigos viram 'holder'.
--   strike                       = obrigatório no formulário; nulo só em registros antigos.
--   underlying_price_at_exercise = preço da ação quando a opção é exercida.
--   current_premium(_updated_at) = resultado não realizado, atualização manual.
--   google_*event_id             = eventos de vencimento no Google Calendar (mesmos nomes de bill_alerts).
--
-- Reaproveitados, sem coluna nova:
--   option_status (já aceita open/exercised/expired/closed) é o status da opção;
--   status continua open/closed porque é compartilhado com Swing Trade.
--   exit_price é o prêmio de saída e exit_date a data de encerramento.
--
-- option_series, expiration_date e premium são usados pelo código, mas nenhuma
-- migration do repositório os cria: os IF NOT EXISTS abaixo alinham o histórico
-- e não têm efeito onde as colunas já existem.
--
-- Nenhuma quantidade antiga é convertida aqui.

ALTER TABLE public.trade_operations
  ADD COLUMN IF NOT EXISTS option_series text NULL,
  ADD COLUMN IF NOT EXISTS expiration_date date NULL,
  ADD COLUMN IF NOT EXISTS premium numeric(15,6) NULL,
  ADD COLUMN IF NOT EXISTS "position" text NOT NULL DEFAULT 'holder',
  ADD COLUMN IF NOT EXISTS strike numeric(14,4) NULL,
  ADD COLUMN IF NOT EXISTS underlying_price_at_exercise numeric(14,4) NULL,
  ADD COLUMN IF NOT EXISTS current_premium numeric(14,4) NULL,
  ADD COLUMN IF NOT EXISTS current_premium_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS google_event_id text NULL,
  ADD COLUMN IF NOT EXISTS google_reminder_event_id text NULL;

ALTER TABLE public.trade_operations DROP CONSTRAINT IF EXISTS trade_operations_position_check;
ALTER TABLE public.trade_operations
  ADD CONSTRAINT trade_operations_position_check
  CHECK ("position" IN ('holder', 'writer'));

NOTIFY pgrst, 'reload schema';
