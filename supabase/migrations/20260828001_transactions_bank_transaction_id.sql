-- =============================================================================
-- MIGRATION: Identificador único do banco (FITID) em transactions
-- Date: 2026-08-28
-- Description: Adiciona bank_transaction_id a transactions — guarda o FITID
--              (Financial Institution Transaction ID) que arquivos OFX/QFX já
--              trazem para cada lançamento. Só existe para importações nesse
--              formato (NULL para CSV/XLSX/PDF/lançamento manual).
--
--              Usado como Camada 1 (alta confiança) da detecção de duplicatas
--              na importação — ver findKnownBankTransactionIds() e
--              importTransactions() em src/lib/actions/transactions.ts. Uma
--              transação com o mesmo bank_transaction_id do mesmo usuário é
--              considerada duplicata certa e é descartada sem nem aparecer na
--              pré-visualização — diferente da Camada 2 (data + valor, ver
--              migration category_source e src/lib/duplicate-detection.ts),
--              que só desmarca a linha por padrão e pede confirmação.
--
--              O índice único parcial (ignora NULL) garante a regra também no
--              banco, não só na aplicação — fecha a janela de corrida entre a
--              pré-visualização e o clique em "Importar" caso o usuário abra
--              duas importações do mesmo arquivo em abas diferentes.
-- =============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS bank_transaction_id text;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_bank_transaction_id_key
  ON public.transactions (user_id, bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;
