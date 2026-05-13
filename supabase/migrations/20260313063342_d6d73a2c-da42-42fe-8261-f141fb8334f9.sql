CREATE TABLE public.operativa_anticipos_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emails text[] DEFAULT '{}',
  primary_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.operativa_anticipos_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access on operativa_anticipos_config"
  ON public.operativa_anticipos_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);