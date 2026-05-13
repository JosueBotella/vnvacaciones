-- Add start_contract_date column to workers table for trial period tracking
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS start_contract_date DATE;

-- Add index for performance when filtering workers by contract date
CREATE INDEX IF NOT EXISTS idx_workers_start_contract_date ON public.workers(start_contract_date) WHERE start_contract_date IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.workers.start_contract_date IS 'Date of the workers last contract start, used to calculate 30-day trial period';