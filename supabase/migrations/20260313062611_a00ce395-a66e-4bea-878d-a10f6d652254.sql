
CREATE TABLE public.operativa_envios_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'justificante',
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by text NOT NULL DEFAULT '',
  destinatarios text[] DEFAULT '{}',
  datos jsonb NOT NULL DEFAULT '{}',
  email_id text
);

ALTER TABLE public.operativa_envios_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON public.operativa_envios_history
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_operativa_envios_tipo ON public.operativa_envios_history(tipo);
CREATE INDEX idx_operativa_envios_sent_at ON public.operativa_envios_history(sent_at DESC);
