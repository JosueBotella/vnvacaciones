
-- Performance indexes for incidencias_records
CREATE INDEX IF NOT EXISTS idx_incidencias_records_dept ON incidencias_records(department_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_records_fecha ON incidencias_records(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_incidencias_records_estado ON incidencias_records(estado);
CREATE INDEX IF NOT EXISTS idx_incidencias_records_accion ON incidencias_records(accion_propuesta);

-- Indexes for record_workers
CREATE INDEX IF NOT EXISTS idx_incidencias_rw_worker ON incidencias_record_workers(worker_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_rw_record ON incidencias_record_workers(record_id);

-- Indexes for propuestas
CREATE INDEX IF NOT EXISTS idx_incidencias_prop_estado ON incidencias_propuestas_rrhh(estado);
CREATE INDEX IF NOT EXISTS idx_incidencias_prop_dept ON incidencias_propuestas_rrhh(department_id);

-- Soft delete column
ALTER TABLE incidencias_records ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Evidence hashes storage
ALTER TABLE incidencias_records ADD COLUMN IF NOT EXISTS evidence_hashes jsonb DEFAULT NULL;
