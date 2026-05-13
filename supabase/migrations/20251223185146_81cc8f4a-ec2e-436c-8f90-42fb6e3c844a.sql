-- Create table for department role aliases
CREATE TABLE public.department_role_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(department_id, alias_name)
);

-- Enable RLS
ALTER TABLE public.department_role_aliases ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage department role aliases"
ON public.department_role_aliases
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anon can view department role aliases"
ON public.department_role_aliases
FOR SELECT
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_department_role_aliases_department_id ON public.department_role_aliases(department_id);
CREATE INDEX idx_department_role_aliases_alias_name ON public.department_role_aliases(alias_name);