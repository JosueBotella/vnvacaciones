
-- Positive categories
CREATE TABLE public.incidencias_positive_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#22c55e',
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_positive_categories ENABLE ROW LEVEL SECURITY;

-- No direct access, only via edge functions (service role)

-- Positive records
CREATE TABLE public.incidencias_positive_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID REFERENCES public.incidencias_departments(id),
  category_id UUID NOT NULL REFERENCES public.incidencias_positive_categories(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  descripcion TEXT NOT NULL DEFAULT '',
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  pruebas_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_positive_records ENABLE ROW LEVEL SECURITY;

-- Positive record workers (many-to-many)
CREATE TABLE public.incidencias_positive_record_workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES public.incidencias_positive_records(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.incidencias_workers(id),
  worker_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_positive_record_workers ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_positive_records_dept ON public.incidencias_positive_records(department_id);
CREATE INDEX idx_positive_records_category ON public.incidencias_positive_records(category_id);
CREATE INDEX idx_positive_records_fecha ON public.incidencias_positive_records(fecha);
CREATE INDEX idx_positive_record_workers_record ON public.incidencias_positive_record_workers(record_id);
CREATE INDEX idx_positive_record_workers_worker ON public.incidencias_positive_record_workers(worker_id);
