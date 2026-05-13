-- Fix overly permissive RLS policy on department_shifts
-- Drop the vulnerable policy that allows any authenticated user to modify shifts
DROP POLICY IF EXISTS "Authenticated users can manage shifts" ON public.department_shifts;

-- Create admin-only management policy
CREATE POLICY "Only admins can manage shifts"
ON public.department_shifts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));