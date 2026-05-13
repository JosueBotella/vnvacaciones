-- Add is_on_vacation column to workers table
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS is_on_vacation boolean NOT NULL DEFAULT false;