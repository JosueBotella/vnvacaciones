-- Add multilingual info_text columns to annual_calendars
ALTER TABLE public.annual_calendars 
  ADD COLUMN IF NOT EXISTS info_text_ar TEXT,
  ADD COLUMN IF NOT EXISTS info_text_fr TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.annual_calendars.info_text IS 'Info text in Spanish (default)';
COMMENT ON COLUMN public.annual_calendars.info_text_ar IS 'Info text in Arabic';
COMMENT ON COLUMN public.annual_calendars.info_text_fr IS 'Info text in French';