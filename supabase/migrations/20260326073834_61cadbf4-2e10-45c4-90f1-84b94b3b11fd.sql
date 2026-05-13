
ALTER TABLE public.incidencias_categories
  ADD COLUMN IF NOT EXISTS importe_rangos jsonb DEFAULT null;

ALTER TABLE public.incidencias_gravedades
  DROP COLUMN IF EXISTS importe_min,
  DROP COLUMN IF EXISTS importe_max;
