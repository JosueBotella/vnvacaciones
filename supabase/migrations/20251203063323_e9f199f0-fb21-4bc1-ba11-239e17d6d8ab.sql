-- Fix RLS for vacation_requests - need permissive INSERT policy
DROP POLICY IF EXISTS "Anyone can create vacation requests" ON public.vacation_requests;
DROP POLICY IF EXISTS "Público puede crear solicitudes" ON public.vacation_requests;

CREATE POLICY "Public can create vacation requests" ON public.vacation_requests
FOR INSERT WITH CHECK (true);

-- Also fix vacation_request_dates
DROP POLICY IF EXISTS "Anyone can create vacation request dates" ON public.vacation_request_dates;
DROP POLICY IF EXISTS "Público puede crear fechas de solicitudes" ON public.vacation_request_dates;

CREATE POLICY "Public can create request dates" ON public.vacation_request_dates
FOR INSERT WITH CHECK (true);