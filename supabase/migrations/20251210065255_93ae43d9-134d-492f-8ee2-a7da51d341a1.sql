-- Create work_groups table (Grupos de Trabajo)
CREATE TABLE public.work_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(department_id, name)
);

-- Enable RLS
ALTER TABLE public.work_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies for work_groups
CREATE POLICY "Admins can manage work groups" ON public.work_groups
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anon can view work groups" ON public.work_groups
FOR SELECT USING (true);

-- Create annual_calendars table
CREATE TABLE public.annual_calendars (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  year integer NOT NULL,
  description text,
  auto_rotate_groups boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(department_id, year)
);

-- Enable RLS
ALTER TABLE public.annual_calendars ENABLE ROW LEVEL SECURITY;

-- RLS policies for annual_calendars
CREATE POLICY "Admins can manage annual calendars" ON public.annual_calendars
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anon can view annual calendars" ON public.annual_calendars
FOR SELECT USING (true);

-- Create day_type enum
CREATE TYPE public.day_type AS ENUM ('laboral', 'festivo', 'vacaciones_generales', 'vacaciones_grupo');

-- Create annual_calendar_days table
CREATE TABLE public.annual_calendar_days (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  calendar_id uuid NOT NULL REFERENCES public.annual_calendars(id) ON DELETE CASCADE,
  date date NOT NULL,
  day_type public.day_type NOT NULL DEFAULT 'laboral',
  legend text,
  group_id uuid REFERENCES public.work_groups(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(calendar_id, date)
);

-- Enable RLS
ALTER TABLE public.annual_calendar_days ENABLE ROW LEVEL SECURITY;

-- RLS policies for annual_calendar_days
CREATE POLICY "Admins can manage calendar days" ON public.annual_calendar_days
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anon can view calendar days" ON public.annual_calendar_days
FOR SELECT USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_work_groups_updated_at
BEFORE UPDATE ON public.work_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_annual_calendars_updated_at
BEFORE UPDATE ON public.annual_calendars
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();