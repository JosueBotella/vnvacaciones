-- Fix: Change USING(true) policies from public role to service_role
-- These tables are ONLY accessed via edge functions (service_role key)
-- No frontend code queries them directly

-- 1. salix_clock_entries
DROP POLICY IF EXISTS "Allow all for service role" ON public.salix_clock_entries;
CREATE POLICY "Allow all for service role" ON public.salix_clock_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. operativa_altas_config
DROP POLICY IF EXISTS "Allow all access for authenticated" ON public.operativa_altas_config;
CREATE POLICY "Allow all for service role" ON public.operativa_altas_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. operativa_envios_history
DROP POLICY IF EXISTS "Allow all access" ON public.operativa_envios_history;
CREATE POLICY "Allow all for service role" ON public.operativa_envios_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. invoice_product_mappings
DROP POLICY IF EXISTS "Allow all access to invoice_product_mappings" ON public.invoice_product_mappings;
CREATE POLICY "Allow all for service role" ON public.invoice_product_mappings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. invoice_comparisons
DROP POLICY IF EXISTS "Allow all access to invoice_comparisons" ON public.invoice_comparisons;
CREATE POLICY "Allow all for service role" ON public.invoice_comparisons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. invoice_suppliers
DROP POLICY IF EXISTS "Allow all access to invoice_suppliers" ON public.invoice_suppliers;
CREATE POLICY "Allow all for service role" ON public.invoice_suppliers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. performance_thresholds
DROP POLICY IF EXISTS "Allow all access to performance_thresholds" ON public.performance_thresholds;
CREATE POLICY "Allow all for service role" ON public.performance_thresholds
  FOR ALL TO service_role USING (true) WITH CHECK (true);
