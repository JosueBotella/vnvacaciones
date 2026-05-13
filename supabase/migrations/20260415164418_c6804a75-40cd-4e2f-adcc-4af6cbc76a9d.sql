ALTER TABLE public.incidencias_propuestas_rrhh 
ADD COLUMN IF NOT EXISTS ai_reasoning_log jsonb DEFAULT '[]'::jsonb;