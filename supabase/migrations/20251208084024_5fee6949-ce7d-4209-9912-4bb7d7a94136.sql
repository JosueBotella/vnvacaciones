-- =============================================
-- FIX 1: Protect password hashes from public access
-- =============================================

-- Drop the overly permissive policy on managers table
DROP POLICY IF EXISTS "Anyone can view managers" ON public.managers;

-- Create a restrictive policy: only admins can directly SELECT from managers table
-- (needed for edge functions using service role, and admin operations)
CREATE POLICY "Only admins can view managers directly"
ON public.managers
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Grant SELECT on the managers_public view to anon and authenticated
-- (the view already excludes password_hash)
GRANT SELECT ON public.managers_public TO anon;
GRANT SELECT ON public.managers_public TO authenticated;

-- =============================================
-- FIX 2: Remove anonymous UPDATE/DELETE on vacation_requests
-- =============================================

-- Drop the dangerous anonymous UPDATE policies
DROP POLICY IF EXISTS "Anon can update vacation requests" ON public.vacation_requests;
DROP POLICY IF EXISTS "Público puede actualizar sus propias solicitudes" ON public.vacation_requests;

-- Drop the dangerous anonymous DELETE policy  
DROP POLICY IF EXISTS "Anon can delete vacation requests" ON public.vacation_requests;

-- Note: UPDATE/DELETE operations go through edge functions (admin-operations, submit-vacation-request)
-- which use service_role key, so they don't need RLS policies

-- =============================================
-- FIX 3: Remove anonymous DELETE on vacation_request_dates
-- =============================================

-- Drop the dangerous anonymous DELETE policy
DROP POLICY IF EXISTS "Anon can delete vacation request dates" ON public.vacation_request_dates;

-- Note: DELETE operations go through edge functions which use service_role key