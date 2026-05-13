-- Drop the view that depends on max_days_per_employee
DROP VIEW IF EXISTS public.departments_public;

-- Change max_days_per_employee in departments from integer to numeric for half-day support
ALTER TABLE public.departments 
ALTER COLUMN max_days_per_employee TYPE numeric(4,1) USING max_days_per_employee::numeric(4,1);

-- Change max_days in personal_calendars from integer to numeric for half-day support  
ALTER TABLE public.personal_calendars
ALTER COLUMN max_days TYPE numeric(4,1) USING max_days::numeric(4,1);

-- Recreate the view with the new column type
CREATE VIEW public.departments_public AS
SELECT 
  id,
  name,
  description,
  slug,
  public_token,
  max_days_per_employee,
  require_all_days,
  created_at,
  updated_at
FROM public.departments;

-- Add half_day column to department_availabilities to support half-day dates
ALTER TABLE public.department_availabilities
ADD COLUMN IF NOT EXISTS half_day boolean NOT NULL DEFAULT false;

-- Add half_day column to personal_calendar_availabilities
ALTER TABLE public.personal_calendar_availabilities
ADD COLUMN IF NOT EXISTS half_day boolean NOT NULL DEFAULT false;

-- Add half_day column to vacation_request_dates to track which dates are half days
ALTER TABLE public.vacation_request_dates
ADD COLUMN IF NOT EXISTS half_day boolean NOT NULL DEFAULT false;