
-- Create table for exception requests on blocked days
CREATE TABLE public.day_exception_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  worker_number TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  worker_email TEXT,
  request_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_MANAGER',
  manager_status TEXT DEFAULT 'PENDING',
  manager_action_by TEXT,
  manager_action_at TIMESTAMP WITH TIME ZONE,
  manager_rejection_reason TEXT,
  admin_status TEXT DEFAULT 'PENDING',
  admin_action_by TEXT,
  admin_action_at TIMESTAMP WITH TIME ZONE,
  admin_rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.day_exception_requests ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anon can insert exception requests"
ON public.day_exception_requests
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Only admins can view exception requests"
ON public.day_exception_requests
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update exception requests"
ON public.day_exception_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete exception requests"
ON public.day_exception_requests
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create table to track approved exceptions per worker per day
CREATE TABLE public.worker_day_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  worker_number TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  exception_date DATE NOT NULL,
  exception_request_id UUID REFERENCES public.day_exception_requests(id) ON DELETE SET NULL,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(department_id, worker_number, exception_date)
);

-- Enable RLS
ALTER TABLE public.worker_day_exceptions ENABLE ROW LEVEL SECURITY;

-- Public can read to check if their exception exists
CREATE POLICY "Anon can view worker exceptions"
ON public.worker_day_exceptions
FOR SELECT
USING (true);

CREATE POLICY "Only admins can manage worker exceptions"
ON public.worker_day_exceptions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger to update updated_at
CREATE TRIGGER update_day_exception_requests_updated_at
BEFORE UPDATE ON public.day_exception_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
