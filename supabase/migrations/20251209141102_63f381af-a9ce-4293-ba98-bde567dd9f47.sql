-- Add require_all_days column
ALTER TABLE public.departments 
ADD COLUMN require_all_days boolean NOT NULL DEFAULT true;