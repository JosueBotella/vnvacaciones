-- Create table for department correction requests
CREATE TABLE public.department_correction_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  current_department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  requested_department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  worker_number TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.department_correction_requests ENABLE ROW LEVEL SECURITY;

-- Anon can insert correction requests
CREATE POLICY "Anon can insert department correction requests"
ON public.department_correction_requests
FOR INSERT
WITH CHECK (true);

-- Only admins can view correction requests
CREATE POLICY "Only admins can view department correction requests"
ON public.department_correction_requests
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update correction requests
CREATE POLICY "Only admins can update department correction requests"
ON public.department_correction_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete correction requests
CREATE POLICY "Only admins can delete department correction requests"
ON public.department_correction_requests
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));