-- Preferência "Tipos de operação visíveis" em Investimentos → Operações.
-- Só controla a exibição: os dados do tipo oculto não são apagados nem alterados.
-- Ambos ligados por padrão; pelo menos um precisa ficar ligado.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_swing_trades boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_option_trades boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_visible_trade_types_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_visible_trade_types_check
  CHECK (show_swing_trades OR show_option_trades);

NOTIFY pgrst, 'reload schema';
