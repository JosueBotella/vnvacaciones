-- Create table for personal worker calendars
CREATE TABLE public.personal_calendars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  worker_name TEXT NOT NULL,
  worker_number TEXT NOT NULL,
  slug TEXT UNIQUE,
  public_token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text),
  max_days INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for personal calendar available dates
CREATE TABLE public.personal_calendar_availabilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  personal_calendar_id UUID NOT NULL REFERENCES public.personal_calendars(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(personal_calendar_id, date)
);

-- Enable RLS
ALTER TABLE public.personal_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_calendar_availabilities ENABLE ROW LEVEL SECURITY;

-- RLS policies - only admins can manage via edge functions (using service role)
CREATE POLICY "Only admins can view personal calendars"
ON public.personal_calendars
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can create personal calendars"
ON public.personal_calendars
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update personal calendars"
ON public.personal_calendars
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete personal calendars"
ON public.personal_calendars
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Availabilities policies
CREATE POLICY "Anon can view personal calendar availabilities"
ON public.personal_calendar_availabilities
FOR SELECT
USING (true);

CREATE POLICY "Only admins can manage personal calendar availabilities"
ON public.personal_calendar_availabilities
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_personal_calendars_updated_at
BEFORE UPDATE ON public.personal_calendars
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_personal_calendars_department ON public.personal_calendars(department_id);
CREATE INDEX idx_personal_calendars_slug ON public.personal_calendars(slug);
CREATE INDEX idx_personal_calendars_public_token ON public.personal_calendars(public_token);