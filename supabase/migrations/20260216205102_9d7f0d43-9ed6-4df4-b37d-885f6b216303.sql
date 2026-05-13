
-- Make modification_id nullable so suspension days can be inserted without a modification record
ALTER TABLE public.worker_personal_calendar_days ALTER COLUMN modification_id DROP NOT NULL;
