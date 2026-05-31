-- ─── Tabela trade_operations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trade_operations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id        uuid REFERENCES public.entities(id) ON DELETE CASCADE,

  type             text NOT NULL CHECK (type IN ('swing', 'options')),

  -- Campos comuns
  ticker           text NOT NULL,
  entry_date       date NOT NULL,
  exit_date        date,
  entry_price      numeric(15,6) NOT NULL,
  exit_price       numeric(15,6),
  quantity         numeric(15,2) NOT NULL,
  fees             numeric(15,2) NOT NULL DEFAULT 0,
  status           text NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
  notes            text,

  -- Campos Swing Trade
  stop_loss        numeric(15,6),
  target_price     numeric(15,6),

  -- Campos Opções
  option_type      text CHECK (option_type IN ('call', 'put')),
  underlying_asset text,
  expiry_date      date,
  option_status    text CHECK (option_status IN ('open', 'exercised', 'expired', 'closed')),

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_trade_ops_user_entity
  ON public.trade_operations(user_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_trade_ops_entry_date
  ON public.trade_operations(entry_date DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION trg_fn_set_trade_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_trade_ops_updated_at ON public.trade_operations;
CREATE TRIGGER trg_trade_ops_updated_at
BEFORE UPDATE ON public.trade_operations
FOR EACH ROW EXECUTE FUNCTION trg_fn_set_trade_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.trade_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trade_ops_select"
  ON public.trade_operations FOR SELECT
  USING (
    user_id = auth.uid()
    AND (
      entity_id IS NULL
      OR entity_id IN (
        SELECT em.entity_id FROM public.entity_members em
        WHERE em.user_id = auth.uid() AND em.accepted_at IS NOT NULL
      )
    )
  );

CREATE POLICY "trade_ops_insert"
  ON public.trade_operations FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      entity_id IS NULL
      OR entity_id IN (
        SELECT em.entity_id FROM public.entity_members em
        WHERE em.user_id = auth.uid() AND em.accepted_at IS NOT NULL
      )
    )
  );

CREATE POLICY "trade_ops_update"
  ON public.trade_operations FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "trade_ops_delete"
  ON public.trade_operations FOR DELETE
  USING (user_id = auth.uid());
