-- Create vacation_group_exchanges table
CREATE TABLE public.vacation_group_exchanges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Employees involved
  employee_a_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  employee_b_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  
  -- Department context
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  
  -- Original groups (stored for reference, not modified)
  original_group_a_id UUID REFERENCES public.work_groups(id) ON DELETE SET NULL,
  original_group_b_id UUID REFERENCES public.work_groups(id) ON DELETE SET NULL,
  
  -- Temporary groups (swapped)
  temporary_group_a_id UUID REFERENCES public.work_groups(id) ON DELETE SET NULL,
  temporary_group_b_id UUID REFERENCES public.work_groups(id) ON DELETE SET NULL,
  
  -- Year of application
  year INTEGER NOT NULL,
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_employee_acceptance', 'accepted_by_employees', 'approved', 'cancelled')),
  
  -- Acceptance tracking
  accepted_by_a BOOLEAN NOT NULL DEFAULT false,
  accepted_by_a_at TIMESTAMPTZ,
  accepted_by_b BOOLEAN NOT NULL DEFAULT false,
  accepted_by_b_at TIMESTAMPTZ,
  
  -- Admin approval
  approved_by_admin BOOLEAN NOT NULL DEFAULT false,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  
  -- Cancellation
  cancelled_by TEXT,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  
  -- Secure tokens for email links
  token_a TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  token_b TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure employees are different
  CONSTRAINT different_employees CHECK (employee_a_id != employee_b_id),
  
  -- Ensure year is valid
  CONSTRAINT valid_year CHECK (year >= 2020 AND year <= 2100)
);

-- Create index for efficient lookups
CREATE INDEX idx_vacation_group_exchanges_year ON public.vacation_group_exchanges(year);
CREATE INDEX idx_vacation_group_exchanges_status ON public.vacation_group_exchanges(status);
CREATE INDEX idx_vacation_group_exchanges_employee_a ON public.vacation_group_exchanges(employee_a_id);
CREATE INDEX idx_vacation_group_exchanges_employee_b ON public.vacation_group_exchanges(employee_b_id);
CREATE INDEX idx_vacation_group_exchanges_department ON public.vacation_group_exchanges(department_id);
CREATE INDEX idx_vacation_group_exchanges_token_a ON public.vacation_group_exchanges(token_a);
CREATE INDEX idx_vacation_group_exchanges_token_b ON public.vacation_group_exchanges(token_b);

-- Enable RLS
ALTER TABLE public.vacation_group_exchanges ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Only admins can view exchanges"
  ON public.vacation_group_exchanges
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can create exchanges"
  ON public.vacation_group_exchanges
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update exchanges"
  ON public.vacation_group_exchanges
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete exchanges"
  ON public.vacation_group_exchanges
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_vacation_group_exchanges_updated_at
  BEFORE UPDATE ON public.vacation_group_exchanges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add to realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.vacation_group_exchanges;

-- Comment
COMMENT ON TABLE public.vacation_group_exchanges IS 'Temporary vacation group exchanges between employees for a specific year';