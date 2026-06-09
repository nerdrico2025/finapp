DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT COALESCE(c1.name, '(PAI NULO)') as pai,
           c2.name as filho,
           c2.type
    FROM categories c2
    LEFT JOIN categories c1 ON c2.parent_id = c1.id
    WHERE c2.type = 'expense'
    ORDER BY c1.name NULLS FIRST, c2.name
  LOOP
    RAISE NOTICE '% | % | %', lpad(r.pai,28), r.filho, r.type;
  END LOOP;
END $$;
