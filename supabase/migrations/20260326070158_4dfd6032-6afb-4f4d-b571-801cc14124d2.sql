ALTER TABLE public.incidencias_categories
  ADD COLUMN IF NOT EXISTS csv_aliases text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS importe_rangos jsonb DEFAULT null;