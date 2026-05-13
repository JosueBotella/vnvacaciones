-- Add last_viewed_at column to justificantes to track when admin last viewed the history
ALTER TABLE public.justificantes 
ADD COLUMN last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;