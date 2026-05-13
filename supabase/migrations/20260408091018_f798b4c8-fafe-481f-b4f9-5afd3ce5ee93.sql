
ALTER TABLE public.incidencias_tasks 
  ADD COLUMN IF NOT EXISTS printed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_photo_url text;

ALTER TABLE public.incidencias_firma_tasks 
  ADD COLUMN IF NOT EXISTS printed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_photo_url text;
