-- Add pending vacation days column to workers table
ALTER TABLE public.workers
ADD COLUMN pending_vacation_days numeric NOT NULL DEFAULT 0;

-- Create calendar review alerts table
CREATE TABLE public.calendar_review_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  worker_number text NOT NULL,
  worker_name text NOT NULL,
  reason text NOT NULL DEFAULT 'Calendario de vacaciones pendiente de revisar',
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamp with time zone,
  resolved_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on calendar_review_alerts
ALTER TABLE public.calendar_review_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for calendar_review_alerts
CREATE POLICY "Only admins can view calendar review alerts"
ON public.calendar_review_alerts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage calendar review alerts"
ON public.calendar_review_alerts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for performance
CREATE INDEX idx_calendar_review_alerts_worker_id ON public.calendar_review_alerts(worker_id);
CREATE INDEX idx_calendar_review_alerts_department_id ON public.calendar_review_alerts(department_id);
CREATE INDEX idx_calendar_review_alerts_is_resolved ON public.calendar_review_alerts(is_resolved);

-- Add comment for documentation
COMMENT ON TABLE public.calendar_review_alerts IS 'Alerts for employees whose vacation calendar needs to be reviewed (new employees or department changes)';
COMMENT ON COLUMN public.workers.pending_vacation_days IS 'Number of vacation days available to the employee for the current year, imported from CSV column "Días pendientes calendario"';