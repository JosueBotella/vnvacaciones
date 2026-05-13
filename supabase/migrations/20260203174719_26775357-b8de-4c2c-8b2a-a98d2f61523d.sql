-- Remove the overly permissive public SELECT policy on psico_test_areas
-- The data is accessed via edge function (psico-test-operations) using service_role
-- which bypasses RLS, so public access is not needed

DROP POLICY IF EXISTS "Public can view active areas" ON public.psico_test_areas;

-- Add a comment explaining the security model
COMMENT ON TABLE public.psico_test_areas IS 'Job evaluation areas for psychometric tests. Public access is via edge function only - no direct client access allowed.';