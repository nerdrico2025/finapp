-- Fix accounts_type_check constraint to match application values
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_type_check
  CHECK (type IN ('checking', 'savings', 'credit_card', 'investment', 'wallet', 'other'));
