-- AI questions to admin + merge proposals system
ALTER TABLE public.incidencias_propuestas_rrhh
  ADD COLUMN IF NOT EXISTS preguntas_admin jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS respuestas_admin jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS necesita_aclaracion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid NULL REFERENCES public.incidencias_propuestas_rrhh(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merge_source_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS merge_admin_context text NULL;

CREATE INDEX IF NOT EXISTS idx_propuestas_rrhh_merged_into ON public.incidencias_propuestas_rrhh(merged_into_id);
CREATE INDEX IF NOT EXISTS idx_propuestas_rrhh_necesita_aclaracion ON public.incidencias_propuestas_rrhh(necesita_aclaracion) WHERE necesita_aclaracion = true;