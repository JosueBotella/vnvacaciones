-- Add unique constraint for time_entries to support upsert
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_worker_date_unique UNIQUE (worker_id, entry_date);