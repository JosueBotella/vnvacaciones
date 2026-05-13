
-- =============================================
-- Fase 4: Categories, Records, Record-Workers
-- =============================================

-- Categories table
CREATE TABLE public.incidencias_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#93d600',
  gravedad text NOT NULL DEFAULT 'leve',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.incidencias_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access to incidencias_categories" ON public.incidencias_categories AS RESTRICTIVE FOR ALL USING (false);

-- Records table
CREATE TABLE public.incidencias_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id uuid NOT NULL REFERENCES public.incidencias_departments(id),
  category_id uuid REFERENCES public.incidencias_categories(id),
  fecha timestamptz NOT NULL DEFAULT now(),
  descripcion text,
  estado text NOT NULL DEFAULT 'abierta',
  created_by_id uuid NOT NULL,
  created_by_name text NOT NULL,
  pruebas_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.incidencias_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access to incidencias_records" ON public.incidencias_records AS RESTRICTIVE FOR ALL USING (false);

-- Record-Workers junction table
CREATE TABLE public.incidencias_record_workers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id uuid NOT NULL REFERENCES public.incidencias_records(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.incidencias_workers(id),
  worker_name text NOT NULL,
  worker_number text
);
ALTER TABLE public.incidencias_record_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access to incidencias_record_workers" ON public.incidencias_record_workers AS RESTRICTIVE FOR ALL USING (false);

-- Storage bucket for attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('incidencias-pruebas', 'incidencias-pruebas', false);

-- Seed default categories
INSERT INTO public.incidencias_categories (name, color, gravedad, sort_order) VALUES
  ('Retraso', '#93d600', 'leve', 1),
  ('Ausencia injustificada', '#f59e0b', 'grave', 2),
  ('Desobediencia', '#f59e0b', 'grave', 3),
  ('Conducta inadecuada', '#f59e0b', 'grave', 4),
  ('Incumplimiento seguridad', '#ef4444', 'muy_grave', 5),
  ('Abandono puesto', '#ef4444', 'muy_grave', 6),
  ('Otros', '#93d600', 'leve', 7);
