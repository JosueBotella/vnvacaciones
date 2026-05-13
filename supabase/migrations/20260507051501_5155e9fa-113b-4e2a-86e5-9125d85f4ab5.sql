ALTER TABLE public.incidencias_propuestas_rrhh
  ADD COLUMN IF NOT EXISTS archivada_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archivada_por text NULL,
  ADD COLUMN IF NOT EXISTS archivada_motivo text NULL;

ALTER TABLE public.incidencias_records
  ADD COLUMN IF NOT EXISTS archivada_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archivada_por text NULL,
  ADD COLUMN IF NOT EXISTS archivada_motivo text NULL;

CREATE INDEX IF NOT EXISTS idx_propuestas_archivada
  ON public.incidencias_propuestas_rrhh (archivada_at)
  WHERE archivada_at IS NOT NULL;