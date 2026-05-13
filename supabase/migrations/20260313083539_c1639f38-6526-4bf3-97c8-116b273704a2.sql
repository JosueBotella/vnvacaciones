CREATE TABLE public.operativa_despidos_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emails text[] NOT NULL DEFAULT '{}',
  primary_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operativa_despidos_config ENABLE ROW LEVEL SECURITY;