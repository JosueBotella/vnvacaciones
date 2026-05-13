
-- Fix: Restrict worker_performance_history to service_role only
-- This table is accessed exclusively via edge functions (admin-operations, control-incidencias-ai)
DROP POLICY IF EXISTS "Authenticated full access" ON public.worker_performance_history;
CREATE POLICY "Allow all for service role" ON public.worker_performance_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);
