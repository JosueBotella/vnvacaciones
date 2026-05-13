-- Create table for personal annual calendar assignments
-- This allows assigning an existing department calendar to specific workers with custom colors
CREATE TABLE public.personal_annual_calendars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  source_calendar_id UUID REFERENCES public.annual_calendars(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(department_id, name, year)
);

-- Create table for worker assignments to personal annual calendars
-- Each worker gets a color (like work_groups) and maps to a source group
CREATE TABLE public.personal_annual_calendar_workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  personal_calendar_id UUID NOT NULL REFERENCES public.personal_annual_calendars(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  worker_name TEXT NOT NULL,
  worker_number TEXT NOT NULL,
  source_group_id UUID REFERENCES public.work_groups(id) ON DELETE SET NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.personal_annual_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_annual_calendar_workers ENABLE ROW LEVEL SECURITY;

-- RLS policies for personal_annual_calendars
CREATE POLICY "Allow authenticated read on personal_annual_calendars"
  ON public.personal_annual_calendars
  FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated insert on personal_annual_calendars"
  ON public.personal_annual_calendars
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on personal_annual_calendars"
  ON public.personal_annual_calendars
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow authenticated delete on personal_annual_calendars"
  ON public.personal_annual_calendars
  FOR DELETE
  USING (true);

-- RLS policies for personal_annual_calendar_workers
CREATE POLICY "Allow authenticated read on personal_annual_calendar_workers"
  ON public.personal_annual_calendar_workers
  FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated insert on personal_annual_calendar_workers"
  ON public.personal_annual_calendar_workers
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on personal_annual_calendar_workers"
  ON public.personal_annual_calendar_workers
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow authenticated delete on personal_annual_calendar_workers"
  ON public.personal_annual_calendar_workers
  FOR DELETE
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_personal_annual_calendars_updated_at
  BEFORE UPDATE ON public.personal_annual_calendars
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();