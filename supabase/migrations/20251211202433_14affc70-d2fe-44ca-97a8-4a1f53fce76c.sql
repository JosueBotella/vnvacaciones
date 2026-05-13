-- Add email field to group_join_requests table
ALTER TABLE public.group_join_requests 
ADD COLUMN IF NOT EXISTS worker_email TEXT;