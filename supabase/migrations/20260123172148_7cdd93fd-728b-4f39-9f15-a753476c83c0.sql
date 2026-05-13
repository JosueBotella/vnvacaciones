-- =============================================
-- SECURITY HARDENING MIGRATION V4 - VNProd
-- =============================================
-- Remove remaining public access policies

-- Remove public access to active psico tests
DROP POLICY IF EXISTS "Public can view active tests" ON psico_tests;

-- The edge function (psico-test-operations) handles public access with service role