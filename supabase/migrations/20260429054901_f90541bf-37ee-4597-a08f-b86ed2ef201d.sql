ALTER TABLE public.incidencias_propuestas_rrhh
ADD COLUMN IF NOT EXISTS target_worker_id uuid;

CREATE INDEX IF NOT EXISTS idx_incidencias_prop_target_worker
ON public.incidencias_propuestas_rrhh (target_worker_id);