-- Remove the policy that exposes worker emails publicly
-- Worker lookups already go through submit-vacation-request edge function with service_role
DROP POLICY IF EXISTS "Anon can view workers" ON public.workers;