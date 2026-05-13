-- Add candidaturas_only flag to managers for restricted access
ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS candidaturas_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.managers.candidaturas_only IS
  'When true, this manager can only log in via /admin/candidaturas/login and only sees the interviews panel.';