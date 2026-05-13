CREATE TABLE public.team_config_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Backup manual',
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

ALTER TABLE public.team_config_backups ENABLE ROW LEVEL SECURITY;