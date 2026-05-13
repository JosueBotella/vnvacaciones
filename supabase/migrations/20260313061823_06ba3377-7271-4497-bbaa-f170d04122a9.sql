
CREATE TABLE public.operativa_altas_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emails text[] DEFAULT '{}',
  primary_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operativa_altas_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access for authenticated" ON public.operativa_altas_config
  FOR ALL USING (true) WITH CHECK (true);
