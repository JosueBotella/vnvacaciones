-- Add column to enable/disable automatic concurrency blocking (enabled by default)
ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS auto_block_by_concurrency boolean NOT NULL DEFAULT true;