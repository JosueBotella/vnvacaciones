-- =====================================================
-- SECURITY HARDENING: Remove public access to role aliases
-- department_role_aliases should only be accessible to admins
-- =====================================================

-- Remove public access policy
DROP POLICY IF EXISTS "Anon can view department role aliases" ON department_role_aliases;