-- Add admin_pruebas_urls column to incidencias_propuestas_rrhh
ALTER TABLE public.incidencias_propuestas_rrhh 
ADD COLUMN IF NOT EXISTS admin_pruebas_urls JSONB DEFAULT '[]'::jsonb;