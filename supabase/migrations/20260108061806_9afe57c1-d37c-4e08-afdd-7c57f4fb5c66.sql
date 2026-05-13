-- Add password_hash column to rrhh_users for login
ALTER TABLE public.rrhh_users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Create settings table for justificantes notifications
CREATE TABLE IF NOT EXISTS public.justificantes_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_emails TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.justificantes_settings ENABLE ROW LEVEL SECURITY;

-- Only admin managers can view and modify settings
CREATE POLICY "Admin managers can manage justificantes settings"
  ON public.justificantes_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default row
INSERT INTO public.justificantes_settings (notification_emails) 
VALUES ('{}')
ON CONFLICT DO NOTHING;

-- Add time_entry_id to justificantes for linking with absences
ALTER TABLE public.justificantes ADD COLUMN IF NOT EXISTS time_entry_id UUID REFERENCES public.time_entries(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_justificantes_time_entry ON public.justificantes(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_justificantes_dates ON public.justificantes(fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_time_entries_worker_date ON public.time_entries(worker_id, entry_date);

-- Create function to find matching absences for a justificante
CREATE OR REPLACE FUNCTION public.find_matching_absences(
  p_worker_id UUID,
  p_fecha_inicio DATE,
  p_fecha_fin DATE
) RETURNS SETOF public.time_entries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.time_entries
  WHERE worker_id = p_worker_id
    AND is_absence = true
    AND entry_date >= p_fecha_inicio
    AND entry_date <= p_fecha_fin
  ORDER BY entry_date;
$$;