
-- Add AI columns to incidencias_records
ALTER TABLE public.incidencias_records
  ADD COLUMN IF NOT EXISTS ai_gravedad_sugerida text,
  ADD COLUMN IF NOT EXISTS ai_categoria_sugerida text,
  ADD COLUMN IF NOT EXISTS ai_recomendacion text,
  ADD COLUMN IF NOT EXISTS ai_motivo_legal text,
  ADD COLUMN IF NOT EXISTS ai_dias_suspension_sugeridos integer,
  ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;

-- Create propuestas RRHH table
CREATE TABLE public.incidencias_propuestas_rrhh (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.incidencias_records(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.incidencias_departments(id),
  tipo text NOT NULL DEFAULT 'amonestacion',
  gravedad text NOT NULL DEFAULT 'leve',
  suspension_dias integer,
  fecha_inicio date,
  estado text NOT NULL DEFAULT 'pendiente',
  email_html text,
  aprobada_por text,
  aprobada_at timestamptz,
  rechazada_por text,
  rechazada_at timestamptz,
  rechazo_motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_propuestas_rrhh ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_propuestas_rrhh"
  ON public.incidencias_propuestas_rrhh
  FOR ALL
  USING (false);

-- Create department rules table
CREATE TABLE public.incidencias_reglas_departamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL UNIQUE REFERENCES public.incidencias_departments(id),
  umbral_leves integer NOT NULL DEFAULT 3,
  umbral_graves integer NOT NULL DEFAULT 2,
  umbral_muy_graves integer NOT NULL DEFAULT 1,
  periodo_dias_evaluacion integer NOT NULL DEFAULT 90,
  activar_automatico boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_reglas_departamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_reglas_departamento"
  ON public.incidencias_reglas_departamento
  FOR ALL
  USING (false);
