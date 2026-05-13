-- Create junction table for manager-department assignments (many-to-many)
CREATE TABLE public.manager_department_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES public.managers(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(manager_id, department_id)
);

-- Enable RLS
ALTER TABLE public.manager_department_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view assignments" ON public.manager_department_assignments
AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Anyone can create assignments" ON public.manager_department_assignments
AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Anyone can delete assignments" ON public.manager_department_assignments
AS PERMISSIVE FOR DELETE TO anon, authenticated USING (true);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.manager_department_assignments TO anon, authenticated;