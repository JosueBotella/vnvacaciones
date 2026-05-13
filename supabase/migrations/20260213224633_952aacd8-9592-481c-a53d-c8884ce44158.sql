
-- Add persistent AI memory/context field for enterprise knowledge
ALTER TABLE public.incidencias_ai_config
ADD COLUMN IF NOT EXISTS memoria_empresa text NOT NULL DEFAULT '';
