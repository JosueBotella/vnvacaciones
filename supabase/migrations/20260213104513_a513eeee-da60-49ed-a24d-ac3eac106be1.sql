
-- Fase 7: Add risk score and AI articles to records, AI draft flag to propuestas
ALTER TABLE public.incidencias_records
  ADD COLUMN IF NOT EXISTS ai_riesgo_reincidencia integer,
  ADD COLUMN IF NOT EXISTS ai_articulos_relevantes jsonb;

ALTER TABLE public.incidencias_propuestas_rrhh
  ADD COLUMN IF NOT EXISTS ai_borrador_generado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rechazada_at timestamptz,
  ADD COLUMN IF NOT EXISTS rechazada_por text,
  ADD COLUMN IF NOT EXISTS rechazo_motivo text;
