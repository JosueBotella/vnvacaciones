-- Add global free days configuration to app_settings
ALTER TABLE app_settings 
ADD COLUMN global_free_days_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN global_free_days_value numeric DEFAULT NULL;