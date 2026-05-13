-- Add SELECT policy for anon role on vacation_requests
CREATE POLICY "Anon can view vacation requests"
ON vacation_requests
FOR SELECT
TO anon
USING (true);

-- Add SELECT policy for anon role on vacation_request_dates  
CREATE POLICY "Anon can view request dates"
ON vacation_request_dates
FOR SELECT
TO anon
USING (true);