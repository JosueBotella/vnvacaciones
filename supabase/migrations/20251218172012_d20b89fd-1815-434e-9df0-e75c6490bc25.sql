-- Add user_id column to workers table to link with Supabase Auth
ALTER TABLE public.workers 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_workers_user_id ON public.workers(user_id);

-- Create unique index to ensure one auth user per worker
CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_user_id_unique ON public.workers(user_id) WHERE user_id IS NOT NULL;