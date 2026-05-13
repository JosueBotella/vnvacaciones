CREATE TABLE public.operativa_nspp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emails text[] DEFAULT '{}',
  primary_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.operativa_nspp_config ENABLE ROW LEVEL SECURITY;