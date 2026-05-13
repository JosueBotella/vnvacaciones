-- Drop overly permissive SELECT policies on vacation_requests
DROP POLICY IF EXISTS "Admin puede ver todas las solicitudes" ON public.vacation_requests;

-- Drop overly permissive UPDATE policy on vacation_requests
DROP POLICY IF EXISTS "Admin puede actualizar solicitudes" ON public.vacation_requests;

-- Drop overly permissive DELETE policy on vacation_requests
DROP POLICY IF EXISTS "Admin puede eliminar solicitudes" ON public.vacation_requests;

-- Drop overly permissive SELECT policy on vacation_request_dates
DROP POLICY IF EXISTS "Admin puede ver fechas de solicitudes" ON public.vacation_request_dates;

-- Drop overly permissive DELETE policy on vacation_request_dates
DROP POLICY IF EXISTS "Admin puede eliminar fechas de solicitudes" ON public.vacation_request_dates;

-- Create restrictive policies - only admins via service_role or has_role can access
-- SELECT on vacation_requests - only authenticated admins
CREATE POLICY "Only admins can view vacation requests"
ON public.vacation_requests
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- UPDATE on vacation_requests - only authenticated admins
CREATE POLICY "Only admins can update vacation requests"
ON public.vacation_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- DELETE on vacation_requests - only authenticated admins
CREATE POLICY "Only admins can delete vacation requests"
ON public.vacation_requests
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- SELECT on vacation_request_dates - only authenticated admins
CREATE POLICY "Only admins can view request dates"
ON public.vacation_request_dates
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- DELETE on vacation_request_dates - only authenticated admins
CREATE POLICY "Only admins can delete request dates"
ON public.vacation_request_dates
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));