-- Add 'purpose' column to email config to separate signature/delivery vs suspension-warning recipients
ALTER TABLE public.incidencias_email_config
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'firma_entrega';

ALTER TABLE public.incidencias_email_config
  DROP CONSTRAINT IF EXISTS incidencias_email_config_purpose_check;

ALTER TABLE public.incidencias_email_config
  ADD CONSTRAINT incidencias_email_config_purpose_check
  CHECK (purpose IN ('firma_entrega', 'suspension_aviso'));

CREATE INDEX IF NOT EXISTS idx_incidencias_email_config_purpose
  ON public.incidencias_email_config (purpose, activo);

-- Track when the suspension-warning email was sent for each proposal (idempotency)
ALTER TABLE public.incidencias_propuestas_rrhh
  ADD COLUMN IF NOT EXISTS suspension_aviso_enviado_at timestamptz NULL;