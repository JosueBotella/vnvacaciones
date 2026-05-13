-- Drop the existing check constraint on managers role
ALTER TABLE public.managers DROP CONSTRAINT IF EXISTS managers_role_check;

-- Add new check constraint that includes 'consulta' role
ALTER TABLE public.managers ADD CONSTRAINT managers_role_check 
CHECK (role IN ('admin', 'manager', 'consulta'));