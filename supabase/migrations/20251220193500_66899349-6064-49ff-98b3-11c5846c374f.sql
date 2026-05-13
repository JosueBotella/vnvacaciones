-- Create app_settings table for usage limits
CREATE TABLE public.app_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    max_rows integer NOT NULL DEFAULT 50000,
    current_rows integer NOT NULL DEFAULT 0,
    is_locked boolean NOT NULL DEFAULT false,
    lock_reason text,
    warning_threshold integer NOT NULL DEFAULT 80,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO public.app_settings (max_rows, current_rows, is_locked, warning_threshold)
VALUES (50000, 0, false, 80);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read app_settings (needed for lock check)
CREATE POLICY "Anyone can view app settings"
ON public.app_settings
FOR SELECT
USING (true);

-- Only admins can update app_settings
CREATE POLICY "Only admins can update app settings"
ON public.app_settings
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();