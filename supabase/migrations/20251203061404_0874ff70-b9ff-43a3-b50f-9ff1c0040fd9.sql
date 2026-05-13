-- Create managers table
CREATE TABLE public.managers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('admin', 'manager')),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view managers for login" ON public.managers
FOR SELECT USING (true);

CREATE POLICY "Admins can manage managers" ON public.managers
FOR ALL USING (true);

-- Insert initial managers
INSERT INTO public.managers (name, role, department_id) VALUES
  ('Álvaro', 'admin', NULL),
  ('José', 'admin', NULL),
  ('Susu', 'manager', NULL),
  ('Dodo', 'manager', NULL),
  ('Pilar', 'manager', NULL),
  ('Reyes', 'manager', NULL),
  ('Norman', 'manager', NULL),
  ('Diego', 'manager', NULL);