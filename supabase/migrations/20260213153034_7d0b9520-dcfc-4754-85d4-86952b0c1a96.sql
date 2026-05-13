
-- ================================================
-- Fase 13: Analytics tables for Control de Incidencias
-- ================================================

-- 1) Worker stats (pre-calculated)
CREATE TABLE public.incidencias_worker_stats (
  worker_id uuid PRIMARY KEY REFERENCES public.incidencias_workers(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.incidencias_departments(id) ON DELETE CASCADE,
  total_count integer NOT NULL DEFAULT 0,
  leves integer NOT NULL DEFAULT 0,
  graves integer NOT NULL DEFAULT 0,
  muy_graves integer NOT NULL DEFAULT 0,
  ultimos_30 integer NOT NULL DEFAULT 0,
  ultimos_60 integer NOT NULL DEFAULT 0,
  ultimos_90 integer NOT NULL DEFAULT 0,
  reincidencias integer NOT NULL DEFAULT 0,
  riesgo_score integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidencias_worker_stats_dept ON public.incidencias_worker_stats(department_id);

ALTER TABLE public.incidencias_worker_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access to incidencias_worker_stats" ON public.incidencias_worker_stats FOR ALL USING (false);

-- 2) Department stats (pre-calculated)
CREATE TABLE public.incidencias_department_stats (
  department_id uuid PRIMARY KEY REFERENCES public.incidencias_departments(id) ON DELETE CASCADE,
  total integer NOT NULL DEFAULT 0,
  leves integer NOT NULL DEFAULT 0,
  graves integer NOT NULL DEFAULT 0,
  muy_graves integer NOT NULL DEFAULT 0,
  media_por_trabajador double precision NOT NULL DEFAULT 0,
  reincidentes integer NOT NULL DEFAULT 0,
  tiempo_medio_resolucion double precision NOT NULL DEFAULT 0,
  riesgo_global integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_department_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access to incidencias_department_stats" ON public.incidencias_department_stats FOR ALL USING (false);

-- 3) Daily metrics (time series)
CREATE TABLE public.incidencias_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  department_id uuid NOT NULL REFERENCES public.incidencias_departments(id) ON DELETE CASCADE,
  total integer NOT NULL DEFAULT 0,
  propuestas integer NOT NULL DEFAULT 0,
  sanciones integer NOT NULL DEFAULT 0,
  reincidentes integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (date, department_id)
);

CREATE INDEX idx_incidencias_daily_metrics_dept ON public.incidencias_daily_metrics(department_id);

ALTER TABLE public.incidencias_daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access to incidencias_daily_metrics" ON public.incidencias_daily_metrics FOR ALL USING (false);

-- Enable realtime for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidencias_worker_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidencias_department_stats;
