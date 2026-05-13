-- Add schedule_configured field to departments table
ALTER TABLE public.departments 
ADD COLUMN schedule_configured boolean NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.departments.schedule_configured IS 'Indicates if department has configured rotating schedules';