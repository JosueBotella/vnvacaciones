ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS fiscal_id text;
CREATE INDEX IF NOT EXISTS idx_workers_fiscal_id ON public.workers (fiscal_id) WHERE fiscal_id IS NOT NULL;