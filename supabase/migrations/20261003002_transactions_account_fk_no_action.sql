-- Exclusão de contas: transactions.account_id deixa de apagar em cascata.
--
-- Antes: transactions_account_id_fkey ... ON DELETE CASCADE — apagar uma conta
-- apagava todo o histórico dela. Agora: NO ACTION — o banco recusa apagar uma
-- conta que ainda tenha transações (a aplicação já bloqueia antes e oferece
-- "Inativar conta").
--
-- NO ACTION, e não RESTRICT: NO ACTION é verificado no fim do comando, então a
-- exclusão de usuário (profiles → accounts e profiles → transactions, ambas em
-- cascata) continua funcionando — as transações somem no mesmo comando e a
-- verificação final passa. RESTRICT verificaria na hora e quebraria esse fluxo.
--
-- transactions_destination_account_id_fkey não é alterada.

BEGIN;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_account_id_fkey;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES public.accounts(id)
  ON DELETE NO ACTION;

COMMIT;

NOTIFY pgrst, 'reload schema';
