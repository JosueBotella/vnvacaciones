-- Create table for weekly shift configurations (independent per week)
CREATE TABLE public.weekly_shift_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  week INTEGER NOT NULL,
  shift_key TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  color TEXT NOT NULL DEFAULT '#93d600',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_rest BOOLEAN NOT NULL DEFAULT false,
  icon_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Unique constraint: one config per department/year/week/shift_key
  CONSTRAINT unique_weekly_shift UNIQUE (department_id, year, week, shift_key)
);

-- Enable RLS
ALTER TABLE public.weekly_shift_configs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow read for authenticated users"
ON public.weekly_shift_configs
FOR SELECT
USING (true);

CREATE POLICY "Allow all for service role"
ON public.weekly_shift_configs
FOR ALL
USING (true)
WITH CHECK (true);

-- Index for faster lookups
CREATE INDEX idx_weekly_shift_configs_lookup 
ON public.weekly_shift_configs(department_id, year, week);

-- Trigger for updated_at
CREATE TRIGGER update_weekly_shift_configs_updated_at
BEFORE UPDATE ON public.weekly_shift_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();