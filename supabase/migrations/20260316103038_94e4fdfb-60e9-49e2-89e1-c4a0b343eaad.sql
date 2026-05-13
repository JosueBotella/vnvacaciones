
CREATE TABLE public.clock_control_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_tolerance_minutes INT NOT NULL DEFAULT 5,
  max_break_minutes INT NOT NULL DEFAULT 20,
  max_breaks_count INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clock_control_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage clock_control_settings"
  ON public.clock_control_settings
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

INSERT INTO public.clock_control_settings DEFAULT VALUES;
