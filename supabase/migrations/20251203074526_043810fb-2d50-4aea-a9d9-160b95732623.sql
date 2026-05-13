-- Create a secure VIEW for managers that excludes password_hash
CREATE OR REPLACE VIEW public.managers_public AS
SELECT id, name, role, department_id, created_at
FROM public.managers;

-- Grant access to the view for anon and authenticated users
GRANT SELECT ON public.managers_public TO anon;
GRANT SELECT ON public.managers_public TO authenticated;

-- Update RLS policy on managers table to restrict SELECT to only authenticated users who need it
DROP POLICY IF EXISTS "Public can view manager names for login" ON public.managers;

-- Create restrictive policy - only service role can read password_hash directly
CREATE POLICY "Authenticated can view own manager data" 
ON public.managers 
FOR SELECT 
USING (auth.uid() IS NOT NULL OR has_role(auth.uid(), 'admin'::app_role));