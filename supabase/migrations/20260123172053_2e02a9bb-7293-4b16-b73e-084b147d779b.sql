-- =============================================
-- SECURITY HARDENING MIGRATION V3 - VNProd
-- =============================================
-- Fix psico_tests table and add missing policies

-- =============================================
-- PHASE 1: PSICO_TESTS - Add admin-only policy
-- =============================================

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "Anyone can view psico tests" ON psico_tests;
DROP POLICY IF EXISTS "Public can view psico tests" ON psico_tests;
DROP POLICY IF EXISTS "Anon can view psico tests" ON psico_tests;

-- Create admin-only policy (candidates access via edge function)
CREATE POLICY "Only admins can view psico tests directly"
  ON psico_tests FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage psico tests"
  ON psico_tests FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- PHASE 2: APP_SETTINGS - Restrict to admin only
-- =============================================

-- Drop public access
DROP POLICY IF EXISTS "Anyone can view app settings" ON app_settings;
DROP POLICY IF EXISTS "Public can view app settings" ON app_settings;

-- Create admin-only SELECT policy
CREATE POLICY "Only admins can view app settings"
  ON app_settings FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));