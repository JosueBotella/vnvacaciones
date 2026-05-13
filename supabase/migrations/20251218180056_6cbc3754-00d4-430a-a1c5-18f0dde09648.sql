-- Add info_text column to annual_calendars for informational text to display on public calendar
ALTER TABLE public.annual_calendars 
ADD COLUMN info_text TEXT DEFAULT NULL;