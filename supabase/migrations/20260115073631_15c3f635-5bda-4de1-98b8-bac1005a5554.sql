-- Añadir columnas para marcar departamentos revisados por consulta
ALTER TABLE public.departments 
ADD COLUMN IF NOT EXISTS consulta_reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS consulta_reviewed_by TEXT;