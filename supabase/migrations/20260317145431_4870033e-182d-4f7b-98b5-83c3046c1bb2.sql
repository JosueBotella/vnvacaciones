ALTER TABLE public.incidencias_reglas_departamento
  ADD COLUMN IF NOT EXISTS valor_leve_equivalente integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS valor_moderada_equivalente integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS valor_grave_equivalente integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS valor_muy_grave_equivalente integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS umbral_combinado_activo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS umbral_combinado_minimo integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS auto_escalar_tipo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notificar_encargado_popup boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notificar_encargado_umbral_pct integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS ia_analisis_automatico boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ia_considerar_convenio boolean NOT NULL DEFAULT true;