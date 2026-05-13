-- Remove dangerous anonymous SELECT policies on vacation_requests
DROP POLICY IF EXISTS "Anon can view vacation requests" ON vacation_requests;

-- Remove dangerous anonymous SELECT policies on vacation_request_dates  
DROP POLICY IF EXISTS "Anon can view request dates" ON vacation_request_dates;