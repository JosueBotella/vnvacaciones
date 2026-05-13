ALTER TABLE public.worker_team_labels
ADD COLUMN IF NOT EXISTS excluded_shift_keys text[] NOT NULL DEFAULT '{}'::text[];