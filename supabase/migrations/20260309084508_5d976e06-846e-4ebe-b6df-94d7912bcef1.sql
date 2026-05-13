CREATE TABLE public.worker_performance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  lines_hour numeric NOT NULL,
  recorded_at date NOT NULL DEFAULT CURRENT_DATE,
  import_source text DEFAULT 'csv',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_perf_history_worker ON public.worker_performance_history(worker_id, recorded_at DESC);
ALTER TABLE public.worker_performance_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.worker_performance_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);