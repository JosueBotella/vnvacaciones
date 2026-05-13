-- Drop ALL existing INSERT policies on vacation_requests and create PERMISSIVE one
DROP POLICY IF EXISTS "Public can create vacation requests" ON public.vacation_requests;
DROP POLICY IF EXISTS "Anyone can create vacation requests" ON public.vacation_requests;
DROP POLICY IF EXISTS "Público puede crear solicitudes" ON public.vacation_requests;

-- Create PERMISSIVE policy (default is PERMISSIVE)
CREATE POLICY "Allow public insert vacation requests" ON public.vacation_requests
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (true);

-- Same for vacation_request_dates
DROP POLICY IF EXISTS "Public can create request dates" ON public.vacation_request_dates;
DROP POLICY IF EXISTS "Anyone can create vacation request dates" ON public.vacation_request_dates;
DROP POLICY IF EXISTS "Público puede crear fechas de solicitudes" ON public.vacation_request_dates;

CREATE POLICY "Allow public insert request dates" ON public.vacation_request_dates
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (true);