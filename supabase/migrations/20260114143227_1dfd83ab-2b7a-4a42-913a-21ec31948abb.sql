-- Table to store worker calendar modifications
CREATE TABLE public.worker_calendar_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  
  -- What changes are being made
  modification_type TEXT NOT NULL CHECK (modification_type IN ('remove_group_days', 'add_personal_days', 'change_group', 'mixed')),
  
  -- Days being removed from group vacation (stored as JSON array of dates)
  removed_group_days JSONB DEFAULT '[]'::jsonb,
  
  -- Personal days being added (stored as JSON array of {date, half_day} objects)
  added_personal_days JSONB DEFAULT '[]'::jsonb,
  
  -- Group change (if applicable)
  original_group_id UUID REFERENCES public.work_groups(id),
  new_group_id UUID REFERENCES public.work_groups(id),
  
  -- Reason/justification from admin
  admin_reason TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  
  -- Workflow status
  status TEXT NOT NULL DEFAULT 'pending_signature' CHECK (status IN ('draft', 'pending_signature', 'signed', 'rejected', 'cancelled')),
  
  -- Signature from worker
  signature TEXT,
  signed_at TIMESTAMP WITH TIME ZONE,
  signed_ip TEXT,
  
  -- Rejection reason if worker rejects
  rejection_reason TEXT,
  rejected_at TIMESTAMP WITH TIME ZONE,
  
  -- Token for secure access
  access_token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  
  -- Year for the modification
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  
  -- Email sent tracking
  email_sent_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.worker_calendar_modifications ENABLE ROW LEVEL SECURITY;

-- Only admins can manage modifications
CREATE POLICY "Only admins can manage calendar modifications"
ON public.worker_calendar_modifications
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_worker_calendar_modifications_updated_at
BEFORE UPDATE ON public.worker_calendar_modifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Table to store the actual applied personal days for workers (after signature)
CREATE TABLE public.worker_personal_calendar_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  modification_id UUID NOT NULL REFERENCES public.worker_calendar_modifications(id) ON DELETE CASCADE,
  
  -- The actual day
  date DATE NOT NULL,
  half_day BOOLEAN NOT NULL DEFAULT false,
  
  -- Type: 'personal_vacation' (added), 'excluded_group' (removed from group)
  day_type TEXT NOT NULL CHECK (day_type IN ('personal_vacation', 'excluded_group')),
  
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint to prevent duplicates
  UNIQUE(worker_id, date, day_type)
);

-- Enable RLS
ALTER TABLE public.worker_personal_calendar_days ENABLE ROW LEVEL SECURITY;

-- Only admins can manage personal calendar days
CREATE POLICY "Only admins can manage personal calendar days"
ON public.worker_personal_calendar_days
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anon can view their own days (for worker calendar view)
CREATE POLICY "Workers can view their own personal days"
ON public.worker_personal_calendar_days
FOR SELECT
USING (true);

-- Add index for performance
CREATE INDEX idx_worker_calendar_modifications_worker ON public.worker_calendar_modifications(worker_id);
CREATE INDEX idx_worker_calendar_modifications_status ON public.worker_calendar_modifications(status);
CREATE INDEX idx_worker_calendar_modifications_token ON public.worker_calendar_modifications(access_token);
CREATE INDEX idx_worker_personal_calendar_days_worker ON public.worker_personal_calendar_days(worker_id);
CREATE INDEX idx_worker_personal_calendar_days_date ON public.worker_personal_calendar_days(date);