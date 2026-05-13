ALTER TABLE public.incidencias_records 
ADD COLUMN IF NOT EXISTS worker_pending boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_incidencias_records_worker_pending 
ON public.incidencias_records (worker_pending) WHERE worker_pending = true;