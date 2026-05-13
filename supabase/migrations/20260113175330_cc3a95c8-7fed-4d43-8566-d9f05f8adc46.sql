-- Add department_notifications column to justificantes_settings
ALTER TABLE public.justificantes_settings 
ADD COLUMN IF NOT EXISTS department_notifications JSONB DEFAULT '[]'::jsonb;