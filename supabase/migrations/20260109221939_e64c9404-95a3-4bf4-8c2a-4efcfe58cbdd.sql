-- Fix 1: Remove overly permissive RLS policy on justificantes_settings
-- Replace with proper admin-only access
DROP POLICY IF EXISTS "Admin managers can manage justificantes settings" ON public.justificantes_settings;

CREATE POLICY "Only admins can manage justificantes settings"
  ON public.justificantes_settings
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Remove anonymous SELECT policy on workers table
-- This was exposing emails, password_hashes, and PII to anonymous users
DROP POLICY IF EXISTS "Anon can view workers" ON public.workers;

-- Workers should only be accessible via edge functions or admin users
-- The existing get_public_workers_by_department() SECURITY DEFINER function
-- already provides safe, limited access for specific use cases

-- Fix 3: Remove anonymous upload policy on justificantes storage bucket
-- Files should only be uploaded through authenticated edge functions
DROP POLICY IF EXISTS "Employees can upload their own justificantes" ON storage.objects;