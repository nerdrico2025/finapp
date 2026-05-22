-- ─── Tabelas: dream_lists e dream_items ──────────────────────────────────────
--
-- Execute no Supabase SQL Editor (project dutzohcickrbmlolcjtp).

CREATE TABLE IF NOT EXISTS public.dream_lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  target_date date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dream_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own dream lists"
  ON public.dream_lists
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.dream_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id    uuid NOT NULL REFERENCES public.dream_lists(id) ON DELETE CASCADE,
  text       text NOT NULL,
  done       boolean NOT NULL DEFAULT false,
  priority   text NOT NULL DEFAULT 'media' CHECK (priority IN ('alta', 'media', 'baixa')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dream_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage items of their own lists"
  ON public.dream_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.dream_lists dl
      WHERE dl.id = dream_items.list_id
        AND dl.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dream_lists dl
      WHERE dl.id = dream_items.list_id
        AND dl.user_id = auth.uid()
    )
  );
