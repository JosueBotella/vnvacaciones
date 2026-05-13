-- =============================================
-- SECURITY HARDENING: Block public access to sensitive tables
-- These tables are ONLY accessed via Edge Functions using service_role
-- This migration blocks all direct access while preserving functionality
-- =============================================

-- =============================================
-- 1. WORKERS TABLE (already has RLS, fix policies)
-- =============================================
-- Drop any remaining permissive policies
DROP POLICY IF EXISTS "Anon can view workers" ON public.workers;
DROP POLICY IF EXISTS "Anyone can view workers" ON public.workers;
DROP POLICY IF EXISTS "Public can view workers" ON public.workers;

-- Keep the admin policy, add explicit deny for non-admins
-- (Admins can manage workers policy already exists and uses has_role)

-- =============================================
-- 2. PERSONAL_WORK_SCHEDULES TABLE
-- =============================================
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role full access" ON public.personal_work_schedules;

-- Create restrictive policy - no direct access (edge functions use service_role which bypasses RLS)
CREATE POLICY "No direct access to personal_work_schedules"
  ON public.personal_work_schedules FOR ALL
  USING (false);

-- =============================================
-- 3. PERSONAL_SCHEDULE_ROTATION_GROUPS TABLE
-- =============================================
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role full access" ON public.personal_schedule_rotation_groups;

-- Create restrictive policy - no direct access
CREATE POLICY "No direct access to personal_schedule_rotation_groups"
  ON public.personal_schedule_rotation_groups FOR ALL
  USING (false);

-- =============================================
-- 4. PERSONAL_ANNUAL_CALENDARS TABLE
-- =============================================
-- Drop all permissive policies
DROP POLICY IF EXISTS "Allow authenticated read on personal_annual_calendars" ON public.personal_annual_calendars;
DROP POLICY IF EXISTS "Allow authenticated insert on personal_annual_calendars" ON public.personal_annual_calendars;
DROP POLICY IF EXISTS "Allow authenticated update on personal_annual_calendars" ON public.personal_annual_calendars;
DROP POLICY IF EXISTS "Allow authenticated delete on personal_annual_calendars" ON public.personal_annual_calendars;

-- Create restrictive policy - no direct access
CREATE POLICY "No direct access to personal_annual_calendars"
  ON public.personal_annual_calendars FOR ALL
  USING (false);

-- =============================================
-- 5. PERSONAL_ANNUAL_CALENDAR_WORKERS TABLE
-- =============================================
-- Drop all permissive policies
DROP POLICY IF EXISTS "Allow authenticated read on personal_annual_calendar_workers" ON public.personal_annual_calendar_workers;
DROP POLICY IF EXISTS "Allow authenticated insert on personal_annual_calendar_workers" ON public.personal_annual_calendar_workers;
DROP POLICY IF EXISTS "Allow authenticated update on personal_annual_calendar_workers" ON public.personal_annual_calendar_workers;
DROP POLICY IF EXISTS "Allow authenticated delete on personal_annual_calendar_workers" ON public.personal_annual_calendar_workers;

-- Create restrictive policy - no direct access
CREATE POLICY "No direct access to personal_annual_calendar_workers"
  ON public.personal_annual_calendar_workers FOR ALL
  USING (false);