-- Create table for group join requests
CREATE TABLE public.group_join_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_number TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  assigned_team_id UUID REFERENCES public.worker_teams(id) ON DELETE SET NULL,
  assigned_work_group_id UUID REFERENCES public.work_groups(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by TEXT
);

-- Enable RLS
ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anon can insert group join requests" 
ON public.group_join_requests 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Only admins can view group join requests" 
ON public.group_join_requests 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update group join requests" 
ON public.group_join_requests 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete group join requests" 
ON public.group_join_requests 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));