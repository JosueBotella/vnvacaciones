-- Add manager notification settings to justificantes_settings
ALTER TABLE public.justificantes_settings
ADD COLUMN IF NOT EXISTS manager_notifications_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS manager_notification_emails jsonb DEFAULT '[]'::jsonb;

-- Comment: manager_notification_emails is a JSONB array of objects like:
-- [{ "manager_id": "uuid", "manager_name": "Name", "email": "email@example.com", "enabled": true }]

-- Create a comprehensive audit log table for justificantes
CREATE TABLE IF NOT EXISTS public.justificante_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  justificante_id uuid REFERENCES public.justificantes(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  worker_name text,
  worker_number text,
  department_name text,
  tipo_justificante text,
  fecha_inicio date,
  fecha_fin date,
  details text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.justificante_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only access to audit logs
CREATE POLICY "Admin can read audit logs"
ON public.justificante_audit_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert (edge functions)
CREATE POLICY "Service can insert audit logs"
ON public.justificante_audit_logs FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_justificante_audit_logs_created_at 
ON public.justificante_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_justificante_audit_logs_action_type 
ON public.justificante_audit_logs(action_type);

CREATE INDEX IF NOT EXISTS idx_justificante_audit_logs_justificante_id 
ON public.justificante_audit_logs(justificante_id);