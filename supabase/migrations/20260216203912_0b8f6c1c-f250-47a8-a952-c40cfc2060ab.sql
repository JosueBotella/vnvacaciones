
-- Add amonestacion threshold columns to incidencias_reglas_departamento
ALTER TABLE public.incidencias_reglas_departamento
  ADD COLUMN IF NOT EXISTS umbral_amonestaciones integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS periodo_dias_amonestaciones integer NOT NULL DEFAULT 90;
