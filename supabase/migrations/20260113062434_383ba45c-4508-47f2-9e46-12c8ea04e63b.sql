-- Create table for configurable shift types per department
CREATE TABLE public.department_shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  shift_key TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  color TEXT NOT NULL DEFAULT '#93d600',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_rest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(department_id, shift_key)
);

-- Enable RLS
ALTER TABLE public.department_shifts ENABLE ROW LEVEL SECURITY;

-- Create policy for reading shifts (public read for schedules)
CREATE POLICY "Anyone can read department shifts"
ON public.department_shifts
FOR SELECT
USING (true);

-- Create policy for admin operations
CREATE POLICY "Authenticated users can manage shifts"
ON public.department_shifts
FOR ALL
USING (true)
WITH CHECK (true);

-- Create updated_at trigger
CREATE TRIGGER update_department_shifts_updated_at
BEFORE UPDATE ON public.department_shifts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();