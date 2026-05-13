-- Add schedule_locked_for_managers field to departments table
ALTER TABLE public.departments 
ADD COLUMN IF NOT EXISTS schedule_locked_for_managers boolean NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.departments.schedule_locked_for_managers IS 'When true, managers cannot modify schedules for this department';