-- Labor module settings table
CREATE TABLE public.labor_module_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courtesy_minutes integer NOT NULL DEFAULT 5,
  delay_threshold_minutes integer NOT NULL DEFAULT 10,
  absence_threshold_hours numeric NOT NULL DEFAULT 4,
  active_modules jsonb NOT NULL DEFAULT '{"workers": true, "schedules": true, "timetracking": true, "summaries": true, "imports": true, "settings": true}'::jsonb,
  future_db_connection_config jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.labor_module_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage settings
CREATE POLICY "Only admins can view labor settings" 
ON public.labor_module_settings 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage labor settings" 
ON public.labor_module_settings 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings
INSERT INTO public.labor_module_settings (id) VALUES (gen_random_uuid());

-- Team schedules table (horarios por equipo)
CREATE TABLE public.team_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  work_group_id uuid REFERENCES public.work_groups(id) ON DELETE SET NULL,
  worker_team_id uuid REFERENCES public.worker_teams(id) ON DELETE SET NULL,
  schedule_type text NOT NULL CHECK (schedule_type IN ('morning', 'afternoon', 'split', 'rest')),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time,
  end_time time,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view team schedules" 
ON public.team_schedules 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage team schedules" 
ON public.team_schedules 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Weekly schedules configuration
CREATE TABLE public.weekly_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  week_number integer NOT NULL CHECK (week_number BETWEEN 1 AND 53),
  year integer NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(department_id, week_number, year)
);

-- Enable RLS
ALTER TABLE public.weekly_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view weekly schedules" 
ON public.weekly_schedules 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage weekly schedules" 
ON public.weekly_schedules 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Time entries (fichajes)
CREATE TABLE public.time_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  clock_in time,
  clock_out time,
  source text NOT NULL DEFAULT 'csv' CHECK (source IN ('csv', 'manual', 'api', 'future_db')),
  delay_minutes integer DEFAULT 0,
  is_absence boolean NOT NULL DEFAULT false,
  observation text,
  import_batch_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(worker_id, entry_date)
);

-- Enable RLS
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view time entries" 
ON public.time_entries 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage time entries" 
ON public.time_entries 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Time entry summaries (resúmenes)
CREATE TABLE public.time_entry_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  week_number integer NOT NULL CHECK (week_number BETWEEN 1 AND 53),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  weekly_delay_minutes integer NOT NULL DEFAULT 0,
  monthly_delay_minutes integer NOT NULL DEFAULT 0,
  absence_days integer NOT NULL DEFAULT 0,
  worked_days integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(worker_id, week_number, year)
);

-- Enable RLS
ALTER TABLE public.time_entry_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view time summaries" 
ON public.time_entry_summaries 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage time summaries" 
ON public.time_entry_summaries 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Import history for labor module
CREATE TABLE public.labor_import_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_type text NOT NULL CHECK (import_type IN ('workers', 'schedules', 'time_entries')),
  file_name text,
  records_processed integer NOT NULL DEFAULT 0,
  records_success integer NOT NULL DEFAULT 0,
  records_error integer NOT NULL DEFAULT 0,
  error_details jsonb,
  imported_by text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.labor_import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view import history" 
ON public.labor_import_history 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage import history" 
ON public.labor_import_history 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add typology column to workers if not exists (for sacadores, encajadores, etc.)
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS typology text;

-- Create indexes for performance
CREATE INDEX idx_time_entries_worker_date ON public.time_entries(worker_id, entry_date);
CREATE INDEX idx_time_entries_date ON public.time_entries(entry_date);
CREATE INDEX idx_time_entry_summaries_worker ON public.time_entry_summaries(worker_id, year, week_number);
CREATE INDEX idx_team_schedules_department ON public.team_schedules(department_id);
CREATE INDEX idx_weekly_schedules_department ON public.weekly_schedules(department_id, year, week_number);