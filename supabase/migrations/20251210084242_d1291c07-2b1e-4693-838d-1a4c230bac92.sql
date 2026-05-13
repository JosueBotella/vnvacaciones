-- Create table for custom legend categories
CREATE TABLE public.custom_day_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_day_types ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage custom day types"
ON public.custom_day_types
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anon can view custom day types"
ON public.custom_day_types
FOR SELECT
USING (true);

-- Add custom_day_type_id to annual_calendar_days to reference custom types
ALTER TABLE public.annual_calendar_days
ADD COLUMN custom_day_type_id UUID REFERENCES public.custom_day_types(id) ON DELETE SET NULL;

-- Create trigger for updated_at
CREATE TRIGGER update_custom_day_types_updated_at
BEFORE UPDATE ON public.custom_day_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();