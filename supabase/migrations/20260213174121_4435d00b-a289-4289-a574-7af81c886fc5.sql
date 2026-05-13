
-- Table for email recipients configuration
CREATE TABLE public.incidencias_email_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_email_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_email_config"
  ON public.incidencias_email_config
  FOR ALL
  USING (false);

-- Add editable email fields to propuestas
ALTER TABLE public.incidencias_propuestas_rrhh
  ADD COLUMN email_subject TEXT,
  ADD COLUMN email_body TEXT;
