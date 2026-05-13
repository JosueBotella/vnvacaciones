-- Create hour_balance_imports table for tracking CSV imports
CREATE TABLE public.hour_balance_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES public.managers(id) ON DELETE SET NULL,
    admin_name TEXT NOT NULL,
    total_csv_records INTEGER NOT NULL DEFAULT 0,
    total_imported INTEGER NOT NULL DEFAULT 0,
    total_ignored INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create hour_balances table for storing worker hour balances
CREATE TABLE public.hour_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
    balance_hours NUMERIC NOT NULL DEFAULT 0,
    import_id UUID REFERENCES public.hour_balance_imports(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(worker_id)
);

-- Create hour_balance_settings table for module configuration
CREATE TABLE public.hour_balance_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hours_format TEXT NOT NULL DEFAULT 'decimal',
    rounding TEXT NOT NULL DEFAULT 'none',
    alert_threshold NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default settings
INSERT INTO public.hour_balance_settings (hours_format, rounding) VALUES ('decimal', 'none');

-- Enable RLS on all tables
ALTER TABLE public.hour_balance_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hour_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hour_balance_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for hour_balance_imports (admin only)
CREATE POLICY "Only admins can view hour balance imports"
ON public.hour_balance_imports
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can insert hour balance imports"
ON public.hour_balance_imports
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete hour balance imports"
ON public.hour_balance_imports
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for hour_balances (admin only)
CREATE POLICY "Only admins can view hour balances"
ON public.hour_balances
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can insert hour balances"
ON public.hour_balances
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update hour balances"
ON public.hour_balances
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete hour balances"
ON public.hour_balances
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for hour_balance_settings (admin only)
CREATE POLICY "Only admins can view hour balance settings"
ON public.hour_balance_settings
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update hour balance settings"
ON public.hour_balance_settings
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updating updated_at
CREATE TRIGGER update_hour_balances_updated_at
BEFORE UPDATE ON public.hour_balances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hour_balance_settings_updated_at
BEFORE UPDATE ON public.hour_balance_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_hour_balances_worker_id ON public.hour_balances(worker_id);
CREATE INDEX idx_hour_balances_import_id ON public.hour_balances(import_id);
CREATE INDEX idx_hour_balance_imports_created_at ON public.hour_balance_imports(created_at DESC);