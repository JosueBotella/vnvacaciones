-- Create manager_sessions table for server-side session validation
CREATE TABLE public.manager_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID NOT NULL REFERENCES public.managers(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast token lookups
CREATE INDEX idx_manager_sessions_token ON public.manager_sessions(token);
CREATE INDEX idx_manager_sessions_manager_id ON public.manager_sessions(manager_id);
CREATE INDEX idx_manager_sessions_expires_at ON public.manager_sessions(expires_at);

-- Enable RLS
ALTER TABLE public.manager_sessions ENABLE ROW LEVEL SECURITY;

-- Only allow service role to access sessions (edge functions)
-- No public access to session data
CREATE POLICY "No public access to sessions"
ON public.manager_sessions
FOR ALL
USING (false);

-- Function to clean up expired sessions (can be called periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.manager_sessions WHERE expires_at < now();
END;
$$;