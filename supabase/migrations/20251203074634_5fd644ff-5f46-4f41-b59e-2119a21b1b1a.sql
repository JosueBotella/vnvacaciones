-- Drop the view and recreate with SECURITY INVOKER (default, safer)
DROP VIEW IF EXISTS public.managers_public;

CREATE VIEW public.managers_public 
WITH (security_invoker = true) AS
SELECT id, name, role, department_id, created_at
FROM public.managers;

-- Grant access to the view for anon and authenticated users
GRANT SELECT ON public.managers_public TO anon;
GRANT SELECT ON public.managers_public TO authenticated;