-- Add alert configuration to labor_module_settings
ALTER TABLE public.labor_module_settings 
ADD COLUMN IF NOT EXISTS alert_threshold_delays integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS alert_threshold_absences integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS alert_email text,
ADD COLUMN IF NOT EXISTS alerts_enabled boolean DEFAULT false;

-- Create table to track sent alerts to avoid duplicates
CREATE TABLE IF NOT EXISTS public.labor_incident_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.workers(id) ON DELETE CASCADE,
  alert_type text NOT NULL, -- 'delays' or 'absences'
  period_start date NOT NULL,
  period_end date NOT NULL,
  incident_count integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.labor_incident_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for labor_incident_alerts
CREATE POLICY "Admins can view all alerts" 
ON public.labor_incident_alerts 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can insert alerts" 
ON public.labor_incident_alerts 
FOR INSERT 
WITH CHECK (true);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_labor_incident_alerts_worker_period 
ON public.labor_incident_alerts(worker_id, period_start, period_end);