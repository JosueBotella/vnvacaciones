
-- Add is_blocked column to managers table
ALTER TABLE public.managers ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
