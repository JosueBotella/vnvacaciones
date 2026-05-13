-- Add second group_id column to annual_calendar_days for dual group assignment
ALTER TABLE public.annual_calendar_days 
ADD COLUMN group_id_2 uuid REFERENCES public.work_groups(id) ON DELETE SET NULL;

-- Add index for better performance
CREATE INDEX idx_annual_calendar_days_group_id_2 ON public.annual_calendar_days(group_id_2);