
-- Fix 1: Remove anon-permissive policies on invoice-pdfs bucket
DROP POLICY IF EXISTS "Allow anon read invoice pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload invoice pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete invoice pdfs" ON storage.objects;

-- Fix 2: Replace unrestricted operativa-capturas policy with service_role only
DROP POLICY IF EXISTS "Service role full access on operativa-capturas" ON storage.objects;

-- Fix 3: Fix weekly_shift_configs policy to authenticated only
DROP POLICY IF EXISTS "Allow read for authenticated users" ON public.weekly_shift_configs;
CREATE POLICY "Allow read for authenticated users" ON public.weekly_shift_configs
  FOR SELECT TO authenticated USING (true);
