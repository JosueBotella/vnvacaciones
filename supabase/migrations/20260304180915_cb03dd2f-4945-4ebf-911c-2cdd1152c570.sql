
ALTER TABLE public.managers ADD COLUMN worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL;
ALTER TABLE public.managers ADD COLUMN worker_team_id uuid REFERENCES public.worker_teams(id) ON DELETE SET NULL;
