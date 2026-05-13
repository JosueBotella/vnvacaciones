-- Add signature column to vacation_requests (stores base64 image)
ALTER TABLE public.vacation_requests 
ADD COLUMN signature text;