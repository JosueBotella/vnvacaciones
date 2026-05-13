
CREATE TABLE public.operativa_justificante_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emails text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.operativa_justificante_config (emails) VALUES ('{}');

ALTER TABLE public.operativa_justificante_config ENABLE ROW LEVEL SECURITY;
