-- Add is_altillo column to workers table
ALTER TABLE public.workers 
ADD COLUMN is_altillo BOOLEAN NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.workers.is_altillo IS 'Indica si el trabajador trabaja en el Altillo';