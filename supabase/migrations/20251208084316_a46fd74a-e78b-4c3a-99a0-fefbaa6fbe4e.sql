-- =============================================
-- FIX: Remove public access to employee personal data
-- =============================================

-- Drop policies that expose employee PII on vacation_requests
DROP POLICY IF EXISTS "Anon can view vacation requests" ON public.vacation_requests;
DROP POLICY IF EXISTS "Authenticated users can view vacation requests" ON public.vacation_requests;

-- Drop policy that exposes vacation dates publicly
DROP POLICY IF EXISTS "Anon can view vacation request dates" ON public.vacation_request_dates;

-- Note: Admin/manager operations use edge functions with service_role key
-- which bypasses RLS, so they don't need additional policies.
-- The existing "Admin puede ver todas las solicitudes" and 
-- "Admin puede ver fechas de solicitudes" policies remain for 
-- authenticated admin users accessing directly via Supabase client.