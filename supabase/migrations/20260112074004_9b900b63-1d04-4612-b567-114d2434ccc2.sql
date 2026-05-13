-- Create table for weekly schedule versions/history
CREATE TABLE public.weekly_schedule_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.weekly_schedules(id) ON DELETE CASCADE,
  configuration JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

-- Index for faster lookups by schedule_id
CREATE INDEX idx_weekly_schedule_versions_schedule_id ON public.weekly_schedule_versions(schedule_id);

-- Enable RLS
ALTER TABLE public.weekly_schedule_versions ENABLE ROW LEVEL SECURITY;

-- No public access - all access through edge function with service role
CREATE POLICY "No direct access to schedule versions"
ON public.weekly_schedule_versions
FOR ALL
USING (false);