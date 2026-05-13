
ALTER TABLE incidencias_records
  ADD COLUMN IF NOT EXISTS ai_tipo_recomendado text,
  ADD COLUMN IF NOT EXISTS ai_tipo_razonamiento text,
  ADD COLUMN IF NOT EXISTS ai_gravedad_recomendada text;
