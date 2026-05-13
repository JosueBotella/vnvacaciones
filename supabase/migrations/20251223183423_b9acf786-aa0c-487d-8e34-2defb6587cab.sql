-- Add role/position field to workers table
ALTER TABLE public.workers 
ADD COLUMN role text;

-- Add comment explaining the purpose
COMMENT ON COLUMN public.workers.role IS 'Functional role within department (e.g. CAMARA, AUXILIAR CAMARA). Informational only, does not affect vacation logic.';