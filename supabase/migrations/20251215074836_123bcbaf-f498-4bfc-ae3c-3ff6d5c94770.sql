-- Create worker_comments table
CREATE TABLE public.worker_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL,
  comment TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.worker_comments ENABLE ROW LEVEL SECURITY;

-- Only admins can manage comments
CREATE POLICY "Admins can manage worker comments"
ON public.worker_comments
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anon can view for edge functions
CREATE POLICY "Anon can view worker comments"
ON public.worker_comments
FOR SELECT
USING (true);