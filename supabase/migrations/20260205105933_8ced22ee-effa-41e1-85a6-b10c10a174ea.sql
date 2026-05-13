-- Create table to store individual vacation days for personal annual calendars
CREATE TABLE public.personal_annual_calendar_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  personal_calendar_id UUID NOT NULL REFERENCES public.personal_annual_calendars(id) ON DELETE CASCADE,
  personal_calendar_worker_id UUID NOT NULL REFERENCES public.personal_annual_calendar_workers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(personal_calendar_worker_id, date)
);

-- Enable RLS
ALTER TABLE public.personal_annual_calendar_days ENABLE ROW LEVEL SECURITY;

-- RLS policies (admin/manager access via edge functions with service role)
CREATE POLICY "No direct access to personal_annual_calendar_days"
  ON public.personal_annual_calendar_days FOR ALL
  USING (false);

-- Create index for performance
CREATE INDEX idx_personal_calendar_days_worker ON public.personal_annual_calendar_days(personal_calendar_worker_id);
CREATE INDEX idx_personal_calendar_days_calendar ON public.personal_annual_calendar_days(personal_calendar_id);
CREATE INDEX idx_personal_calendar_days_date ON public.personal_annual_calendar_days(date);