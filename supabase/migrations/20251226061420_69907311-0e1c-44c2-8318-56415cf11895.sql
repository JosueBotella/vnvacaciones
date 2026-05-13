-- Add is_reviewed field to annual_calendars table
ALTER TABLE public.annual_calendars 
ADD COLUMN is_reviewed boolean NOT NULL DEFAULT false;

-- Add reviewed_at timestamp to track when it was marked as reviewed
ALTER TABLE public.annual_calendars 
ADD COLUMN reviewed_at timestamp with time zone;