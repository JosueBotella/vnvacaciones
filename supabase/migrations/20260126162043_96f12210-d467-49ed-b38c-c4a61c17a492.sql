-- =============================================================
-- Security Hardening: Remove public SELECT policies from 8 tables
-- All data access now routed through authenticated edge functions
-- =============================================================

-- 1. Remove public policy from annual_calendars and restrict to admin
DROP POLICY IF EXISTS "Anon can view annual calendars" ON annual_calendars;

-- The existing "Admins can manage annual calendars" policy already covers admin SELECT

-- 2. Remove public policy from annual_calendar_days and restrict to admin  
DROP POLICY IF EXISTS "Anon can view calendar days" ON annual_calendar_days;

-- The existing "Admins can manage calendar days" policy already covers admin SELECT

-- 3. Remove public policy from work_groups and restrict to admin
DROP POLICY IF EXISTS "Anon can view work groups" ON work_groups;

-- The existing "Admins can manage work groups" policy already covers admin SELECT

-- 4. Remove public policy from worker_teams and restrict to admin
DROP POLICY IF EXISTS "Anon can view worker teams" ON worker_teams;

-- Add admin-only SELECT policy (no existing one covers SELECT for admins)
CREATE POLICY "Only admins can view worker teams"
  ON worker_teams FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Remove public policy from custom_day_types and restrict to admin
DROP POLICY IF EXISTS "Anon can view custom day types" ON custom_day_types;

-- The existing "Admins can manage custom day types" policy already covers admin SELECT

-- 6. Add admin-only SELECT policy for department_availabilities
-- (Currently has no policy that allows SELECT for admins)
DROP POLICY IF EXISTS "Anon can view department availabilities" ON department_availabilities;

-- Create policy if not exists for admin SELECT
CREATE POLICY "Only admins can view department availabilities"
  ON department_availabilities FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 7. Remove public policy from work_group_teams if exists and restrict to admin
DROP POLICY IF EXISTS "Anon can view work group teams" ON work_group_teams;

-- Check if table has RLS enabled and add policy
DO $$
BEGIN
  -- Enable RLS if not already enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'work_group_teams' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.work_group_teams ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Add admin-only policy for work_group_teams
CREATE POLICY "Only admins can view work group teams"
  ON work_group_teams FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage work group teams"
  ON work_group_teams FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 8. Remove public policy from department_role_aliases if exists and restrict to admin
DROP POLICY IF EXISTS "Anon can view role aliases" ON department_role_aliases;

-- Check if table has RLS enabled and add policy
DO $$
BEGIN
  -- Enable RLS if not already enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'department_role_aliases' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.department_role_aliases ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Add admin-only policy for department_role_aliases
CREATE POLICY "Only admins can view role aliases"
  ON department_role_aliases FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage role aliases"
  ON department_role_aliases FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 9. Remove public SELECT from worker_day_exceptions
DROP POLICY IF EXISTS "Anyone can read day exceptions" ON worker_day_exceptions;

-- Add admin-only policy if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'worker_day_exceptions') THEN
    -- Enable RLS if not already enabled
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = 'worker_day_exceptions' 
      AND rowsecurity = true
    ) THEN
      EXECUTE 'ALTER TABLE public.worker_day_exceptions ENABLE ROW LEVEL SECURITY';
    END IF;
  END IF;
END $$;

CREATE POLICY "Only admins can view worker day exceptions"
  ON worker_day_exceptions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================================
-- Summary of changes:
-- - Removed 8 public SELECT policies (USING (true))
-- - Added/ensured admin-only SELECT policies for all tables
-- - All public data access now goes through edge functions using service_role
-- =============================================================