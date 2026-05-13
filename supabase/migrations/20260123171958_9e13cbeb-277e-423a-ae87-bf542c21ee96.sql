-- =============================================
-- SECURITY HARDENING MIGRATION V2 - VNProd
-- =============================================
-- Fix remaining security issues without breaking functionality

-- =============================================
-- PHASE 1: LOGIN ATTEMPTS - Add missing policy
-- =============================================

CREATE POLICY "Only admins can view login attempts"
  ON login_attempts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage login attempts"
  ON login_attempts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- PHASE 2: PSICO TEST QUESTIONS - Remove public access
-- Questions should be served via edge function only
-- =============================================

DROP POLICY IF EXISTS "Anyone can view questions" ON psico_test_questions;

-- =============================================
-- PHASE 3: Additional hardening for tables that might have gaps
-- =============================================

-- Ensure department_shifts only allows admin access (remove public SELECT)
DROP POLICY IF EXISTS "Anyone can read department shifts" ON department_shifts;

-- Note: department_shifts already has "Only admins can manage shifts" policy