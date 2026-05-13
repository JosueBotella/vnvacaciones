ALTER TABLE public.incidencias_records
ADD COLUMN origen text NOT NULL DEFAULT 'manual';

ALTER TABLE public.incidencias_records
ADD COLUMN csv_metadata jsonb DEFAULT NULL;

COMMENT ON COLUMN public.incidencias_records.origen IS 'Source: manual, csv_import';
COMMENT ON COLUMN public.incidencias_records.csv_metadata IS 'Extra CSV fields not mapped to standard columns';