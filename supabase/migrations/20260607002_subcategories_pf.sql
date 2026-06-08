-- =============================================================================
-- MIGRATION: Subcategorias padrão PF
-- Date: 2026-06-07
-- Description: Popula estrutura hierárquica de categorias para usuários PF.
--              Insere categorias pai e subcategorias, preserva categorias
--              customizadas (is_default = false criadas pelo usuário) e
--              remapeia transações de categorias genéricas antigas para as novas.
-- =============================================================================

DO $$
DECLARE
  ent RECORD;
  uid uuid;
  eid uuid;

  -- IDs das categorias pai (despesa)
  pid_moradia        uuid;
  pid_alimentacao    uuid;
  pid_saude          uuid;
  pid_educacao       uuid;
  pid_lazer          uuid;
  pid_financas       uuid;
  pid_vestuario      uuid;
  pid_pets           uuid;
  pid_impostos       uuid;
  pid_outros_exp     uuid;

  -- ID da categoria pai (receita)
  pid_receitas       uuid;

  -- ID da antiga categoria "Lazer" (para remapear transações)
  old_lazer_id       uuid;

BEGIN
  FOR ent IN
    SELECT e.id AS entity_id, e.owner_id AS user_id
    FROM   public.entities e
    WHERE  e.type = 'personal'
  LOOP
    uid := ent.user_id;
    eid := ent.entity_id;

    -- =========================================================================
    -- DESPESAS — categorias pai
    -- =========================================================================

    -- Moradia
    SELECT id INTO pid_moradia
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Moradia' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_moradia IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Moradia', 'expense', '🏠', '#8b5cf6', false, null)
      RETURNING id INTO pid_moradia;
    END IF;

    -- Alimentação
    SELECT id INTO pid_alimentacao
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Alimentação' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_alimentacao IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Alimentação', 'expense', '🍽️', '#ef4444', false, null)
      RETURNING id INTO pid_alimentacao;
    END IF;

    -- Saúde
    SELECT id INTO pid_saude
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Saúde' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_saude IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Saúde', 'expense', '💊', '#ec4899', false, null)
      RETURNING id INTO pid_saude;
    END IF;

    -- Educação
    SELECT id INTO pid_educacao
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Educação' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_educacao IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Educação', 'expense', '📚', '#14b8a6', false, null)
      RETURNING id INTO pid_educacao;
    END IF;

    -- Lazer e Entretenimento (nova; antiga era "Lazer")
    SELECT id INTO old_lazer_id
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Lazer' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    SELECT id INTO pid_lazer
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Lazer e Entretenimento' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_lazer IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Lazer e Entretenimento', 'expense', '🎬', '#3b82f6', false, null)
      RETURNING id INTO pid_lazer;
    END IF;

    -- Remapeia transações da antiga "Lazer" para "Lazer e Entretenimento"
    IF old_lazer_id IS NOT NULL AND pid_lazer IS NOT NULL AND old_lazer_id <> pid_lazer THEN
      UPDATE public.transactions
      SET category_id = pid_lazer
      WHERE user_id = uid AND entity_id = eid AND category_id = old_lazer_id;
    END IF;

    -- Finanças e Dívidas
    SELECT id INTO pid_financas
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Finanças e Dívidas' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_financas IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Finanças e Dívidas', 'expense', '💳', '#6366f1', false, null)
      RETURNING id INTO pid_financas;
    END IF;

    -- Vestuário
    SELECT id INTO pid_vestuario
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Vestuário' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_vestuario IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Vestuário', 'expense', '👕', '#f59e0b', false, null)
      RETURNING id INTO pid_vestuario;
    END IF;

    -- Pets
    SELECT id INTO pid_pets
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Pets' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_pets IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Pets', 'expense', '🐾', '#f97316', false, null)
      RETURNING id INTO pid_pets;
    END IF;

    -- Impostos e Taxas
    SELECT id INTO pid_impostos
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Impostos e Taxas' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_impostos IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Impostos e Taxas', 'expense', '📋', '#64748b', false, null)
      RETURNING id INTO pid_impostos;
    END IF;

    -- Outros (despesa)
    SELECT id INTO pid_outros_exp
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Outros' AND type = 'expense' AND parent_id IS NULL
    LIMIT 1;

    IF pid_outros_exp IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Outros', 'expense', '📦', '#9ca3af', false, null)
      RETURNING id INTO pid_outros_exp;
    END IF;

    -- =========================================================================
    -- DESPESAS — subcategorias
    -- =========================================================================

    -- Moradia
    IF pid_moradia IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#8b5cf6', false, pid_moradia
      FROM (VALUES
        ('Aluguel',            '🏠'),
        ('Condomínio',         '🏢'),
        ('Energia elétrica',   '⚡'),
        ('Água e esgoto',      '💧'),
        ('Internet',           '📡'),
        ('IPVA e seguro auto', '🚗')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_moradia
      );
    END IF;

    -- Alimentação
    IF pid_alimentacao IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#ef4444', false, pid_alimentacao
      FROM (VALUES
        ('Supermercado',                '🛒'),
        ('Restaurantes e lanchonetes',  '🍴'),
        ('Delivery',                    '🛵'),
        ('Padaria e café',              '☕')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_alimentacao
      );
    END IF;

    -- Saúde
    IF pid_saude IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#ec4899', false, pid_saude
      FROM (VALUES
        ('Plano de saúde',         '🏥'),
        ('Consultas médicas',      '👨‍⚕️'),
        ('Medicamentos',           '💊'),
        ('Exames laboratoriais',   '🔬'),
        ('Academia e bem-estar',   '🏋️')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_saude
      );
    END IF;

    -- Educação
    IF pid_educacao IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#14b8a6', false, pid_educacao
      FROM (VALUES
        ('Escola e faculdade',        '🎓'),
        ('Cursos e treinamentos',     '📖'),
        ('Livros e material escolar', '📚')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_educacao
      );
    END IF;

    -- Lazer e Entretenimento
    IF pid_lazer IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#3b82f6', false, pid_lazer
      FROM (VALUES
        ('Streaming (Netflix, Spotify…)', '📺'),
        ('Viagens e hospedagem',          '✈️'),
        ('Cinema, teatro e shows',        '🎭'),
        ('Hobbies e esportes',            '⚽')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_lazer
      );
    END IF;

    -- Finanças e Dívidas
    IF pid_financas IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#6366f1', false, pid_financas
      FROM (VALUES
        ('Financiamento imobiliário',  '🏗️'),
        ('Financiamento de veículo',   '🚘'),
        ('Empréstimo pessoal',         '🏦'),
        ('Consórcio',                  '📑'),
        ('Cartão de crédito (fatura)', '💳'),
        ('Tarifas bancárias',          '🏛️')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_financas
      );
    END IF;

    -- Vestuário
    IF pid_vestuario IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#f59e0b', false, pid_vestuario
      FROM (VALUES
        ('Roupas',                '👗'),
        ('Calçados e acessórios', '👟')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_vestuario
      );
    END IF;

    -- Pets
    IF pid_pets IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#f97316', false, pid_pets
      FROM (VALUES
        ('Ração e petiscos',    '🦴'),
        ('Veterinário',         '🐶'),
        ('Pet shop e banho',    '🛁')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_pets
      );
    END IF;

    -- Impostos e Taxas
    IF pid_impostos IS NOT NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'expense', sub.icon, '#64748b', false, pid_impostos
      FROM (VALUES
        ('Imposto de Renda', '📄'),
        ('Outras taxas',     '📋')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'expense' AND c2.parent_id = pid_impostos
      );
    END IF;

    -- =========================================================================
    -- RECEITAS — categoria pai + subcategorias
    -- =========================================================================

    SELECT id INTO pid_receitas
    FROM public.categories
    WHERE user_id = uid AND entity_id = eid AND name = 'Receitas' AND type = 'income' AND parent_id IS NULL
    LIMIT 1;

    IF pid_receitas IS NULL THEN
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      VALUES (uid, eid, 'Receitas', 'income', '💰', '#10b981', false, null)
      RETURNING id INTO pid_receitas;
    END IF;

    IF pid_receitas IS NOT NULL THEN
      -- Eleva categorias de receita já existentes para subcategorias de "Receitas"
      -- (apenas as que eram categorias raiz genéricas; preserva parent_id já setado)
      UPDATE public.categories
      SET parent_id = pid_receitas
      WHERE user_id = uid AND entity_id = eid AND type = 'income'
        AND parent_id IS NULL AND id <> pid_receitas
        AND name IN ('Salário', 'Freelance', 'Investimentos', 'Outros');

      -- Insere subcategorias de receita faltantes
      INSERT INTO public.categories (user_id, entity_id, name, type, icon, color, is_default, parent_id)
      SELECT uid, eid, sub.name, 'income', sub.icon, '#10b981', false, pid_receitas
      FROM (VALUES
        ('Salário',                      '💼'),
        ('Freelance e renda extra',      '💻'),
        ('Aluguel recebido',             '🏠'),
        ('Rendimentos de investimentos', '📈'),
        ('Reembolsos',                   '↩️'),
        ('Outros recebimentos',          '💰')
      ) AS sub(name, icon)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories c2
        WHERE c2.user_id = uid AND c2.entity_id = eid
          AND c2.name = sub.name AND c2.type = 'income' AND c2.parent_id = pid_receitas
      );
    END IF;

  END LOOP;
END $$;
