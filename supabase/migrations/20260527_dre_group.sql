-- Add dre_group column to categories for DRE mapping
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS dre_group text
  CHECK (dre_group IN ('receita_bruta', 'deducoes', 'cmv', 'despesa_operacional', 'depreciacao'));
