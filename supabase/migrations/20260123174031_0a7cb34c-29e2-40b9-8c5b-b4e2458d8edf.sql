-- Add is_reviewed flag to weekly_schedules table for per-week review status
ALTER TABLE public.weekly_schedules 
ADD COLUMN IF NOT EXISTS is_reviewed boolean NOT NULL DEFAULT false;

-- Add reviewed_at timestamp to track when the week was marked as reviewed
ALTER TABLE public.weekly_schedules 
ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Add reviewed_by to track who reviewed the schedule
ALTER TABLE public.weekly_schedules 
ADD COLUMN IF NOT EXISTS reviewed_by text;

-- Create index for efficient lookups of reviewed schedules
CREATE INDEX IF NOT EXISTS idx_weekly_schedules_reviewed 
ON public.weekly_schedules (department_id, year, week_number, is_reviewed);

-- Add index for finding upcoming reviewed schedules
CREATE INDEX IF NOT EXISTS idx_weekly_schedules_lookup 
ON public.weekly_schedules (department_id, year, week_number);