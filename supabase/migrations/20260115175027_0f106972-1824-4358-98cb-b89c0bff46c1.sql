-- Add field to deduct free configuration days per group
ALTER TABLE public.work_groups ADD COLUMN IF NOT EXISTS free_days_deduction numeric DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.work_groups.free_days_deduction IS 'Number of free configuration days to deduct from the calculated total';