-- Interviews table
CREATE TABLE public.interviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_at TIMESTAMPTZ NOT NULL,
  room TEXT,
  additional_info TEXT,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT,
  candidate_phone TEXT,
  cv_file_url TEXT,
  cv_file_type TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  job_position_id UUID REFERENCES public.job_positions(id) ON DELETE SET NULL,
  application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  created_by_manager_id UUID REFERENCES public.managers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interviews_scheduled_at ON public.interviews(scheduled_at);
CREATE INDEX idx_interviews_department_id ON public.interviews(department_id);

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

-- Deny all direct access; edge function uses service role
CREATE POLICY "Deny all direct access to interviews"
ON public.interviews
FOR ALL
USING (false)
WITH CHECK (false);

CREATE TRIGGER update_interviews_updated_at
BEFORE UPDATE ON public.interviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Interview evaluations
CREATE TABLE public.interview_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES public.managers(id) ON DELETE CASCADE,
  manager_name TEXT NOT NULL,
  manager_role TEXT NOT NULL,
  notes TEXT,
  rating INT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  decision TEXT CHECK (decision IS NULL OR decision IN ('pass', 'doubt', 'reject')),
  attended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interview_id, manager_id)
);

CREATE INDEX idx_interview_evaluations_interview_id ON public.interview_evaluations(interview_id);
CREATE INDEX idx_interview_evaluations_manager_id ON public.interview_evaluations(manager_id);

ALTER TABLE public.interview_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all direct access to interview_evaluations"
ON public.interview_evaluations
FOR ALL
USING (false)
WITH CHECK (false);

CREATE TRIGGER update_interview_evaluations_updated_at
BEFORE UPDATE ON public.interview_evaluations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();