-- Add business-specific fields to entities
ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS tax_regime text
    CHECK (tax_regime IN ('simples_nacional', 'lucro_presumido', 'lucro_real', 'mei')),
  ADD COLUMN IF NOT EXISTS activity   text,
  ADD COLUMN IF NOT EXISTS logo_url   text;

-- Create entity-logos storage bucket (public read, 2 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'entity-logos',
  'entity-logos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public           = true,
  file_size_limit  = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS policies
DROP POLICY IF EXISTS "entity_logos_select" ON storage.objects;
DROP POLICY IF EXISTS "entity_logos_insert" ON storage.objects;
DROP POLICY IF EXISTS "entity_logos_update" ON storage.objects;
DROP POLICY IF EXISTS "entity_logos_delete" ON storage.objects;

CREATE POLICY "entity_logos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'entity-logos');

CREATE POLICY "entity_logos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'entity-logos');

CREATE POLICY "entity_logos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'entity-logos');

CREATE POLICY "entity_logos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'entity-logos');
