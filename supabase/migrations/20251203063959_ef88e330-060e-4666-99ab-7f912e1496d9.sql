-- Drop existing INSERT policy and recreate for anon role
DROP POLICY IF EXISTS "Allow public insert vacation requests" ON public.vacation_requests;

CREATE POLICY "Anon can insert vacation requests" ON public.vacation_requests
AS PERMISSIVE
FOR INSERT
TO anon
WITH CHECK (true);

-- Also add for authenticated users
CREATE POLICY "Auth can insert vacation requests" ON public.vacation_requests
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Same for vacation_request_dates
DROP POLICY IF EXISTS "Allow public insert request dates" ON public.vacation_request_dates;

CREATE POLICY "Anon can insert request dates" ON public.vacation_request_dates
AS PERMISSIVE
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Auth can insert request dates" ON public.vacation_request_dates
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (true);