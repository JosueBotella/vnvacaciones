-- Make record_id nullable for NSPP proposals (no underlying incident)
ALTER TABLE incidencias_propuestas_rrhh
  ALTER COLUMN record_id DROP NOT NULL;

-- Add NSPP-specific fields
ALTER TABLE incidencias_propuestas_rrhh
  ADD COLUMN IF NOT EXISTS nspp_justificacion text,
  ADD COLUMN IF NOT EXISTS nspp_worker_name text,
  ADD COLUMN IF NOT EXISTS nspp_worker_number text,
  ADD COLUMN IF NOT EXISTS nspp_start_contract_date date,
  ADD COLUMN IF NOT EXISTS nspp_days_remaining integer,
  ADD COLUMN IF NOT EXISTS nspp_encargado_name text;