
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS lines_hour numeric DEFAULT NULL;

CREATE TABLE IF NOT EXISTS public.performance_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  green_min numeric NOT NULL DEFAULT 80,
  yellow_min numeric NOT NULL DEFAULT 60,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(department_id)
);

ALTER TABLE public.performance_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to performance_thresholds" ON public.performance_thresholds FOR ALL USING (true) WITH CHECK (true);
