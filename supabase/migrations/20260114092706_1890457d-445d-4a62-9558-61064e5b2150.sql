-- Add manual free days configuration to departments
ALTER TABLE public.departments 
ADD COLUMN manual_free_days_enabled BOOLEAN DEFAULT false,
ADD COLUMN manual_free_days_value DECIMAL(4,1) DEFAULT NULL;

COMMENT ON COLUMN public.departments.manual_free_days_enabled IS 'When true, use manual_free_days_value instead of automatic calculation';
COMMENT ON COLUMN public.departments.manual_free_days_value IS 'Manual override for free disposition days for all workers in this department';