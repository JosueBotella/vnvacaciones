
-- Global rules table (same structure as incidencias_reglas_departamento but without department_id)
CREATE TABLE public.incidencias_reglas_globales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  umbral_leves integer NOT NULL DEFAULT 3,
  umbral_graves integer NOT NULL DEFAULT 2,
  umbral_muy_graves integer NOT NULL DEFAULT 1,
  periodo_dias_evaluacion integer NOT NULL DEFAULT 90,
  activar_automatico boolean NOT NULL DEFAULT false,
  umbral_amonestaciones integer NOT NULL DEFAULT 3,
  periodo_dias_amonestaciones integer NOT NULL DEFAULT 90,
  umbral_graves_despido integer NOT NULL DEFAULT 3,
  umbral_muy_graves_despido integer NOT NULL DEFAULT 1,
  periodo_dias_despido integer NOT NULL DEFAULT 365,
  alerta_despido_activa boolean NOT NULL DEFAULT true,
  valor_leve_equivalente integer NOT NULL DEFAULT 1,
  valor_moderada_equivalente integer NOT NULL DEFAULT 2,
  valor_grave_equivalente integer NOT NULL DEFAULT 3,
  valor_muy_grave_equivalente integer NOT NULL DEFAULT 5,
  umbral_combinado_activo boolean NOT NULL DEFAULT false,
  umbral_combinado_minimo integer NOT NULL DEFAULT 10,
  auto_escalar_tipo boolean NOT NULL DEFAULT true,
  notificar_encargado_popup boolean NOT NULL DEFAULT true,
  notificar_encargado_umbral_pct integer NOT NULL DEFAULT 80,
  ia_analisis_automatico boolean NOT NULL DEFAULT true,
  ia_considerar_convenio boolean NOT NULL DEFAULT true,
  escalado_reglas jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add escalado_reglas to existing department rules table
ALTER TABLE public.incidencias_reglas_departamento
  ADD COLUMN IF NOT EXISTS escalado_reglas jsonb NOT NULL DEFAULT '[]'::jsonb;

-- RLS: service_role only
ALTER TABLE public.incidencias_reglas_globales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on incidencias_reglas_globales"
  ON public.incidencias_reglas_globales
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
