
-- Table: incidencias_legal_documents
CREATE TABLE public.incidencias_legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id uuid NOT NULL REFERENCES public.incidencias_propuestas_rrhh(id),
  worker_id uuid NOT NULL,
  worker_name text NOT NULL,
  worker_number text,
  department_id uuid NOT NULL REFERENCES public.incidencias_departments(id),
  tipo text NOT NULL DEFAULT 'amonestacion',
  gravedad_final text NOT NULL DEFAULT 'leve',
  descripcion_hechos text NOT NULL DEFAULT '',
  fundamentacion_juridica text NOT NULL DEFAULT '',
  articulos_citados jsonb DEFAULT '[]'::jsonb,
  sancion_aplicada text,
  suspension boolean NOT NULL DEFAULT false,
  dias_suspension integer,
  fecha_inicio_suspension date,
  plazo_alegaciones_dias integer DEFAULT 3,
  html_content text NOT NULL DEFAULT '',
  pdf_url text,
  firma_trabajador_url text,
  firma_empresa_url text,
  firmado boolean NOT NULL DEFAULT false,
  firmado_at timestamptz,
  firmado_ip text,
  anulado boolean NOT NULL DEFAULT false,
  anulado_motivo text,
  anulado_por text,
  anulado_at timestamptz,
  email_enviado boolean NOT NULL DEFAULT false,
  email_enviado_at timestamptz,
  email_destinatario text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

ALTER TABLE public.incidencias_legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_legal_documents"
  ON public.incidencias_legal_documents
  AS RESTRICTIVE
  FOR ALL
  USING (false);

-- Table: incidencias_firma_tasks
CREATE TABLE public.incidencias_firma_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_document_id uuid NOT NULL REFERENCES public.incidencias_legal_documents(id),
  worker_id uuid NOT NULL,
  worker_name text NOT NULL,
  status text NOT NULL DEFAULT 'pendiente',
  firma_url text,
  firma_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.incidencias_firma_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_firma_tasks"
  ON public.incidencias_firma_tasks
  AS RESTRICTIVE
  FOR ALL
  USING (false);

-- Indexes
CREATE INDEX idx_legal_docs_propuesta ON public.incidencias_legal_documents(propuesta_id);
CREATE INDEX idx_legal_docs_worker ON public.incidencias_legal_documents(worker_id);
CREATE INDEX idx_firma_tasks_document ON public.incidencias_firma_tasks(legal_document_id);
CREATE INDEX idx_firma_tasks_worker ON public.incidencias_firma_tasks(worker_id);
