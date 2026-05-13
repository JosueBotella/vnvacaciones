-- Add signature fields to vacation group exchanges for employee confirmation
ALTER TABLE public.vacation_group_exchanges
ADD COLUMN IF NOT EXISTS signature_a TEXT NULL,
ADD COLUMN IF NOT EXISTS signature_b TEXT NULL;

-- Optional: store who signed (string label) and when (use existing accepted_by_*_at already)
-- No additional constraints required.