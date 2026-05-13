
CREATE TABLE public.salidas_voluntarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  worker_name text NOT NULL,
  worker_number text,
  department_id uuid,
  department_name text,
  manager_id uuid NOT NULL,
  manager_name text NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  hora time NOT NULL DEFAULT CURRENT_TIME,
  firma_base64 text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.salidas_voluntarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on salidas_voluntarias"
  ON public.salidas_voluntarias
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
