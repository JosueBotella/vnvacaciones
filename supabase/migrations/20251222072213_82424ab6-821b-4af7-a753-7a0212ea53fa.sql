-- Add manual vacation days adjustment field to workers table
ALTER TABLE public.workers 
ADD COLUMN vacation_days_adjustment numeric NOT NULL DEFAULT 0;

-- Add comment to explain the field
COMMENT ON COLUMN public.workers.vacation_days_adjustment IS 'Manual adjustment for vacation days. Negative values reduce available days, positive values increase them.';