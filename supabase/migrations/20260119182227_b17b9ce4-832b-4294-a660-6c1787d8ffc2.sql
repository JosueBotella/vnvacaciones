-- =============================================
-- SECURITY FIX: Remove permissive public policies exposing sensitive data
-- Issues fixed:
-- 1. departments_manager_emails - Manager emails exposed
-- 2. departments_public_token_exposure - Public tokens exposed
-- 3. worker_personal_calendar_days_public_exposure - Vacation schedules exposed
-- =============================================

-- 1. Remove the overly permissive public SELECT policy on departments
-- This policy exposes manager_email and public_token to anonymous users
DROP POLICY IF EXISTS "Public can view departments" ON public.departments;

-- The departments_public VIEW and get_public_departments() RPC already exist
-- and properly exclude sensitive fields (manager_email, public_token)
-- Admins can still access full table via "Only admins can view full departments" policy

-- 2. Fix worker_personal_calendar_days - restrict to admins only
-- Currently has a permissive "Workers can view their own personal days" policy
-- that uses USING (true) which exposes ALL worker vacation data

DROP POLICY IF EXISTS "Workers can view their own personal days" ON public.worker_personal_calendar_days;

-- Create a proper admin-only policy for this table
-- Worker access to their calendar days is handled via edge functions (worker-personal)
CREATE POLICY "Only admins can view personal calendar days"
  ON public.worker_personal_calendar_days
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Log this security fix
INSERT INTO public.security_events (event_type, severity, details)
VALUES (
  'SECURITY_FIX_APPLIED',
  'info',
  jsonb_build_object(
    'fix_type', 'RLS_POLICY_RESTRICTION',
    'tables_affected', ARRAY['departments', 'worker_personal_calendar_days'],
    'policies_removed', ARRAY['Public can view departments', 'Workers can view their own personal days'],
    'timestamp', now()
  )
);