
-- Fix 1: Enable RLS and add service_role-only policies on operativa config tables
ALTER TABLE IF EXISTS public.operativa_despidos_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.operativa_nspp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.operativa_justificante_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.operativa_despidos_config
  FOR ALL USING (false);

CREATE POLICY "Service role only" ON public.operativa_nspp_config
  FOR ALL USING (false);

CREATE POLICY "Service role only" ON public.operativa_justificante_config
  FOR ALL USING (false);

-- Fix 2: Enable RLS and add service_role-only policy on clock_entry_edits
ALTER TABLE public.clock_entry_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.clock_entry_edits
  FOR ALL USING (false);
