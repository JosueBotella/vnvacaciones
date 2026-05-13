
-- Add last_activity column to manager_sessions for inactivity tracking
ALTER TABLE public.manager_sessions 
ADD COLUMN IF NOT EXISTS last_activity timestamptz NOT NULL DEFAULT now();

-- Update existing sessions to have last_activity = created_at or now
UPDATE public.manager_sessions SET last_activity = now() WHERE last_activity IS NULL;

-- Create index for efficient cleanup of inactive sessions
CREATE INDEX IF NOT EXISTS idx_manager_sessions_last_activity ON public.manager_sessions(last_activity);
