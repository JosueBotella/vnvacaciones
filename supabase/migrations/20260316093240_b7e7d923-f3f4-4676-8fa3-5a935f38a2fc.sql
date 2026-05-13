
CREATE TABLE public.salix_clock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_number TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  department_name TEXT NOT NULL,
  punch_date DATE NOT NULL,
  punch_time TIME NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'middle', 'out')),
  worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  import_batch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(worker_number, punch_date, punch_time)
);

CREATE INDEX idx_salix_clock_worker ON public.salix_clock_entries(worker_number, punch_date);
CREATE INDEX idx_salix_clock_date ON public.salix_clock_entries(punch_date);

ALTER TABLE public.salix_clock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON public.salix_clock_entries FOR ALL USING (true) WITH CHECK (true);
