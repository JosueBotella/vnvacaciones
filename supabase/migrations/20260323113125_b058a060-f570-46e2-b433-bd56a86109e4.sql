-- Fix: incidencias_losses was exposed to public role, restrict to service_role only
DROP POLICY IF EXISTS "Service role full access" ON public.incidencias_losses;
CREATE POLICY "Service role full access on incidencias_losses"
  ON public.incidencias_losses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);