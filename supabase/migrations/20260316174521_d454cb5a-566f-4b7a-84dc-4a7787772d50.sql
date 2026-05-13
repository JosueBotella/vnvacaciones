ALTER TABLE public.incidencias_email_config ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;

UPDATE public.incidencias_email_config
SET is_primary = true
WHERE id = (
  SELECT id FROM public.incidencias_email_config
  WHERE activo = true
  ORDER BY created_at ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.incidencias_email_config WHERE is_primary = true
);