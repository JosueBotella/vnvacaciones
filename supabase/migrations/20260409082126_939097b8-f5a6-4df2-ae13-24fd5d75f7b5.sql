
-- Add suspension_fechas to propuestas
ALTER TABLE public.incidencias_propuestas_rrhh
ADD COLUMN IF NOT EXISTS suspension_fechas jsonb DEFAULT NULL;

-- Create changelog table for proposal edits
CREATE TABLE IF NOT EXISTS public.incidencias_propuestas_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id uuid NOT NULL REFERENCES public.incidencias_propuestas_rrhh(id) ON DELETE CASCADE,
  campo text NOT NULL,
  valor_anterior text,
  valor_nuevo text,
  cambiado_por text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.incidencias_propuestas_changelog ENABLE ROW LEVEL SECURITY;

-- Allow all operations (internal admin system, no auth.uid)
CREATE POLICY "Allow all access to changelog"
ON public.incidencias_propuestas_changelog
FOR ALL
USING (true)
WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_propuestas_changelog_propuesta_id ON public.incidencias_propuestas_changelog(propuesta_id);
