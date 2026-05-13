CREATE TABLE public.schedule_ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  instructions text NOT NULL DEFAULT '',
  corrections text NOT NULL DEFAULT '',
  learned_rule text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_ai_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.schedule_ai_memory
  FOR ALL TO authenticated USING (true) WITH CHECK (true);