-- Add is_on_leave field to workers table
ALTER TABLE public.workers ADD COLUMN is_on_leave boolean NOT NULL DEFAULT false;