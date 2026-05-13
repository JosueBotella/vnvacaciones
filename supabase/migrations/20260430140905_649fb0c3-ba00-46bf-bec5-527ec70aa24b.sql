ALTER TABLE public.incidencias_propuestas_rrhh
ADD COLUMN IF NOT EXISTS disabled_manager_pruebas jsonb NOT NULL DEFAULT '[]'::jsonb;