-- Add fields to track admin requests on behalf of workers
ALTER TABLE public.vacation_requests 
ADD COLUMN IF NOT EXISTS requested_by_admin_name text,
ADD COLUMN IF NOT EXISTS is_admin_request boolean NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.vacation_requests.requested_by_admin_name IS 'Name of admin who requested on behalf of the worker';
COMMENT ON COLUMN public.vacation_requests.is_admin_request IS 'Whether this request was made by an admin on behalf of the worker';