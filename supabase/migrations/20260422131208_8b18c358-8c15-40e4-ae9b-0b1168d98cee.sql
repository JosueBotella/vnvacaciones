-- Add explicit "sanción sin suspensión" flag to incidencias_propuestas_rrhh.
-- Differentiates "0 días por defecto" from "0 días intencionados (clemencia)"
-- so the legal document AI can render the proper clemency clause.
ALTER TABLE public.incidencias_propuestas_rrhh
  ADD COLUMN IF NOT EXISTS sin_suspension_explicita boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.incidencias_propuestas_rrhh.sin_suspension_explicita IS
  'TRUE cuando el admin marca explícitamente "sanción sin suspensión" para una sanción grave/muy grave. La IA debe redactar el documento como atenuación empresarial (Art. 58 ET).';