ALTER TABLE public.incidencias_workers
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false;