
CREATE TABLE public.clock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  punched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on clock_entries"
  ON public.clock_entries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_clock_entries_worker ON public.clock_entries(worker_id, punched_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.clock_entries;
