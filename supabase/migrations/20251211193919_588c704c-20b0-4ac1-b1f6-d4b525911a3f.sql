-- Create worker_teams table for work teams per department (A1, A2, B1, B2, etc.)
CREATE TABLE public.worker_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create workers table to store worker info
CREATE TABLE public.workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  worker_team_id UUID REFERENCES public.worker_teams(id) ON DELETE SET NULL,
  worker_number TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(department_id, worker_number)
);

-- Create junction table to link worker_teams to work_groups (vacation color groups)
CREATE TABLE public.work_group_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_group_id UUID NOT NULL REFERENCES public.work_groups(id) ON DELETE CASCADE,
  worker_team_id UUID NOT NULL REFERENCES public.worker_teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(work_group_id, worker_team_id)
);

-- Enable RLS
ALTER TABLE public.worker_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_group_teams ENABLE ROW LEVEL SECURITY;

-- RLS policies for worker_teams
CREATE POLICY "Admins can manage worker teams" ON public.worker_teams FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anon can view worker teams" ON public.worker_teams FOR SELECT USING (true);

-- RLS policies for workers
CREATE POLICY "Admins can manage workers" ON public.workers FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anon can view workers" ON public.workers FOR SELECT USING (true);

-- RLS policies for work_group_teams
CREATE POLICY "Admins can manage work group teams" ON public.work_group_teams FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anon can view work group teams" ON public.work_group_teams FOR SELECT USING (true);

-- Add triggers for updated_at
CREATE TRIGGER update_worker_teams_updated_at
  BEFORE UPDATE ON public.worker_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();