
-- ============================================
-- Fase 3.5: Isolated tables for Control de Incidencias
-- ============================================

-- 1. incidencias_departments
CREATE TABLE public.incidencias_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

ALTER TABLE public.incidencias_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_departments"
  ON public.incidencias_departments
  FOR ALL
  USING (false);

-- 2. incidencias_workers
CREATE TABLE public.incidencias_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.incidencias_departments(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  apellidos text,
  email text,
  telefono text,
  worker_number text,
  external_url_salix text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_workers"
  ON public.incidencias_workers
  FOR ALL
  USING (false);

-- 3. incidencias_department_managers
CREATE TABLE public.incidencias_department_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL,
  department_id uuid NOT NULL REFERENCES public.incidencias_departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(manager_id, department_id)
);

ALTER TABLE public.incidencias_department_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_department_managers"
  ON public.incidencias_department_managers
  FOR ALL
  USING (false);

-- Indexes for performance
CREATE INDEX idx_incidencias_workers_department ON public.incidencias_workers(department_id);
CREATE INDEX idx_incidencias_dept_managers_manager ON public.incidencias_department_managers(manager_id);
CREATE INDEX idx_incidencias_dept_managers_department ON public.incidencias_department_managers(department_id);
