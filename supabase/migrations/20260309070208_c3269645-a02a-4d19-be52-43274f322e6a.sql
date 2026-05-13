
CREATE TABLE public.clock_entry_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clock_entry_id uuid REFERENCES public.clock_entries(id) ON DELETE SET NULL,
  worker_id uuid REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  manager_id uuid NOT NULL,
  manager_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clock_entry_edits ENABLE ROW LEVEL SECURITY;
