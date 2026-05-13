-- Add column to track which manager approved/rejected the request
ALTER TABLE public.vacation_requests 
ADD COLUMN IF NOT EXISTS manager_action_by TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.vacation_requests.manager_action_by IS 'Name of the manager who approved or rejected the request';