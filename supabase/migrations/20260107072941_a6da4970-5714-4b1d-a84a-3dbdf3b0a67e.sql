-- Table to store schedule rules per department for auto-generation
CREATE TABLE public.department_schedule_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL, -- 'friday_afternoon', 'rotation', 'single_team', 'custom'
  rule_config JSONB NOT NULL DEFAULT '{}', -- flexible config per rule type
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.department_schedule_rules ENABLE ROW LEVEL SECURITY;

-- Only admins can manage schedule rules
CREATE POLICY "Admins can manage schedule rules"
  ON public.department_schedule_rules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Trigger to update updated_at
CREATE TRIGGER update_department_schedule_rules_updated_at
  BEFORE UPDATE ON public.department_schedule_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_department_schedule_rules_department ON public.department_schedule_rules(department_id);