-- Add edit request fields to vacation_requests
ALTER TABLE public.vacation_requests 
ADD COLUMN IF NOT EXISTS edit_request_reason text,
ADD COLUMN IF NOT EXISTS edit_request_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS edit_request_by text,
ADD COLUMN IF NOT EXISTS edit_request_at timestamp with time zone;