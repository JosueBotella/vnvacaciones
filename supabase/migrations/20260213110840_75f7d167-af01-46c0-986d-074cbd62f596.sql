
CREATE TABLE public.incidencias_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incidencia_id uuid,
  propuesta_id uuid,
  actor_id uuid NOT NULL,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  action_type text NOT NULL,
  cambios_json jsonb,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_audit_logs"
  ON public.incidencias_audit_logs FOR ALL USING (false);

CREATE INDEX idx_incidencias_audit_logs_incidencia ON public.incidencias_audit_logs(incidencia_id);
CREATE INDEX idx_incidencias_audit_logs_action ON public.incidencias_audit_logs(action_type);
CREATE INDEX idx_incidencias_audit_logs_created ON public.incidencias_audit_logs(created_at DESC);
