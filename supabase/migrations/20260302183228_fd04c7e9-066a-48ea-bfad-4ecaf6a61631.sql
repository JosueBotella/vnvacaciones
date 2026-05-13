
ALTER TABLE public.workers ADD COLUMN is_responsable boolean NOT NULL DEFAULT false;
ALTER TABLE public.worker_teams ADD COLUMN responsable_worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL;
