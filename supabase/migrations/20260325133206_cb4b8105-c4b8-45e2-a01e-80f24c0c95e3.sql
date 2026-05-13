
-- Add points system columns to incidencias_categories
ALTER TABLE public.incidencias_categories 
  ADD COLUMN IF NOT EXISTS puntos integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS es_critico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consecuencia_critico text DEFAULT 'sancion';

-- Add points system columns to incidencias_reglas_globales
ALTER TABLE public.incidencias_reglas_globales
  ADD COLUMN IF NOT EXISTS puntos_leve integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS puntos_moderada integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS puntos_grave integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS puntos_muy_grave integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS umbral_amonestacion_puntos integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS periodo_puntos_dias integer NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS sistema_puntos_activo boolean NOT NULL DEFAULT true;

-- Add points system columns to incidencias_reglas_departamento
ALTER TABLE public.incidencias_reglas_departamento
  ADD COLUMN IF NOT EXISTS puntos_leve integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS puntos_moderada integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS puntos_grave integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS puntos_muy_grave integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS umbral_amonestacion_puntos integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS periodo_puntos_dias integer NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS sistema_puntos_activo boolean NOT NULL DEFAULT true;

-- Set default puntos for existing categories based on their gravedad
UPDATE public.incidencias_categories SET puntos = 1 WHERE gravedad = 'leve';
UPDATE public.incidencias_categories SET puntos = 10 WHERE gravedad = 'moderada';
UPDATE public.incidencias_categories SET puntos = 25 WHERE gravedad = 'grave';
UPDATE public.incidencias_categories SET puntos = 80 WHERE gravedad = 'muy_grave';
