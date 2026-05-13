-- Fix RLS: re-create the public INSERT policy on applications with explicit roles
-- so anonymous candidates can submit the application form again.
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.applications;

CREATE POLICY "Anyone can submit applications"
ON public.applications
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Ensure required base privileges for anon/authenticated to insert
GRANT INSERT ON public.applications TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;