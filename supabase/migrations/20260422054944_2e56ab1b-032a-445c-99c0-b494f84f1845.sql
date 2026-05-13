-- Add audiencia previa workflow columns to propuestas
ALTER TABLE public.incidencias_propuestas_rrhh
  ADD COLUMN IF NOT EXISTS requiere_audiencia_previa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audiencia_previa_completada_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS audiencia_previa_notas text,
  ADD COLUMN IF NOT EXISTS pliego_cargos_generado_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS pliego_cargos_html text;

COMMENT ON COLUMN public.incidencias_propuestas_rrhh.requiere_audiencia_previa IS 'Si TRUE, requiere conceder 5 días hábiles de audiencia previa antes de aprobar la sanción definitiva (faltas muy graves)';
COMMENT ON COLUMN public.incidencias_propuestas_rrhh.audiencia_previa_completada_at IS 'Fecha en la que el admin marcó la audiencia previa como completada (con o sin alegaciones)';
COMMENT ON COLUMN public.incidencias_propuestas_rrhh.pliego_cargos_generado_at IS 'Fecha de generación del pliego de cargos (apertura de expediente)';