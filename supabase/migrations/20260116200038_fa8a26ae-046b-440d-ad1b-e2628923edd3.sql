-- Fix CHECK constraint on worker_personal_calendar_days.day_type to allow all valid day types
-- This was causing silent failures when signing calendar modifications

-- Drop the existing constraint
ALTER TABLE public.worker_personal_calendar_days 
DROP CONSTRAINT IF EXISTS worker_personal_calendar_days_day_type_check;

-- Add new constraint with all valid day types
ALTER TABLE public.worker_personal_calendar_days 
ADD CONSTRAINT worker_personal_calendar_days_day_type_check 
CHECK (day_type IN (
  'personal_vacation',
  'excluded_group', 
  'unlocked_by_admin',
  'libre_configuracion',
  'admin_assigned',
  'free_assignment'
));