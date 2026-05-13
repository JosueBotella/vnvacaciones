-- =====================================================
-- SECURITY HARDENING: Remove public access to sensitive tables
-- This migration removes anonymous SELECT policies from:
-- 1. department_availabilities
-- 2. personal_calendar_availabilities
-- 3. worker_day_exceptions
-- All data access is now routed through authenticated edge functions
-- =====================================================

-- 1. department_availabilities: Remove ALL public/anonymous access policies
DROP POLICY IF EXISTS "Anon can view availabilities" ON department_availabilities;
DROP POLICY IF EXISTS "Admin puede ver disponibilidades" ON department_availabilities;

-- The admin-only policy already exists from previous migration, just verify
-- "Only admins can view department availabilities" with USING (has_role(auth.uid(), 'admin'))

-- 2. personal_calendar_availabilities: Remove public access
DROP POLICY IF EXISTS "Anon can view personal calendar availabilities" ON personal_calendar_availabilities;

-- Ensure admin-only SELECT policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'personal_calendar_availabilities' 
    AND policyname = 'Only admins can view personal calendar availabilities'
  ) THEN
    CREATE POLICY "Only admins can view personal calendar availabilities"
      ON personal_calendar_availabilities
      FOR SELECT
      USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

-- 3. worker_day_exceptions: Remove public access
DROP POLICY IF EXISTS "Anon can view worker exceptions" ON worker_day_exceptions;

-- Ensure admin-only SELECT policy exists (already exists as "Only admins can view worker day exceptions")

-- =====================================================
-- SUMMARY OF SECURITY CHANGES:
-- - department_availabilities: Only admins can SELECT (edge functions use service_role)
-- - personal_calendar_availabilities: Only admins can SELECT (edge functions use service_role)
-- - worker_day_exceptions: Only admins can SELECT (edge functions use service_role)
-- 
-- Public forms (WorkerEntry, PublicVacationForm) now use edge functions:
-- - get-department-availability action in submit-vacation-request
-- - get-personal-calendar-availability action in submit-vacation-request
-- =====================================================