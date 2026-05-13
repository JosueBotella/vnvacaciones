ALTER TABLE public.incidencias_records ADD COLUMN IF NOT EXISTS duplicated_from_record_id UUID NULL;
ALTER TABLE public.incidencias_propuestas_rrhh ADD COLUMN IF NOT EXISTS duplicated_from_propuesta_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_incidencias_records_duplicated_from ON public.incidencias_records(duplicated_from_record_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_propuestas_duplicated_from ON public.incidencias_propuestas_rrhh(duplicated_from_propuesta_id);