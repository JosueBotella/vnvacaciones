ALTER TABLE public.clock_control_settings
  ADD COLUMN IF NOT EXISTS break_almuerzo_max_minutes INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS break_comida_max_minutes INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS break_merienda_max_minutes INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS max_total_break_minutes INT NOT NULL DEFAULT 100;