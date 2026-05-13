-- Create table for storing group color configurations per department
CREATE TABLE public.schedule_group_colors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  group_letter TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#93d600',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(department_id, group_letter)
);

-- Enable RLS
ALTER TABLE public.schedule_group_colors ENABLE ROW LEVEL SECURITY;

-- Restrictive policy - all access via edge function
CREATE POLICY "No direct access to schedule_group_colors"
  ON public.schedule_group_colors
  FOR ALL
  USING (false);

-- Add trigger for updated_at
CREATE TRIGGER update_schedule_group_colors_updated_at
  BEFORE UPDATE ON public.schedule_group_colors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_schedule_group_colors_department ON public.schedule_group_colors(department_id);