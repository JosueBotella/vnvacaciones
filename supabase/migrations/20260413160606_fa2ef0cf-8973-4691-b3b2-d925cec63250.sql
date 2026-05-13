-- Add support for multiple signed photos
ALTER TABLE public.incidencias_firma_tasks
ADD COLUMN IF NOT EXISTS signed_photo_urls JSONB DEFAULT '[]'::jsonb;

-- Migrate existing single photo to array if present
UPDATE public.incidencias_firma_tasks
SET signed_photo_urls = jsonb_build_array(signed_photo_url)
WHERE signed_photo_url IS NOT NULL
  AND (signed_photo_urls IS NULL OR signed_photo_urls = '[]'::jsonb);