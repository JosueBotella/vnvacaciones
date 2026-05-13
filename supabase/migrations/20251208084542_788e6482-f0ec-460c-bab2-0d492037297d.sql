-- =============================================
-- FIX: Create departments_public view without manager_email
-- to prevent email harvesting for phishing attacks
-- =============================================

-- Create a public view that excludes sensitive manager_email
CREATE OR REPLACE VIEW public.departments_public AS
SELECT 
  id,
  name,
  description,
  slug,
  public_token,
  max_days_per_employee,
  created_at,
  updated_at
FROM public.departments;

-- Grant SELECT on the view to anon and authenticated roles
GRANT SELECT ON public.departments_public TO anon;
GRANT SELECT ON public.departments_public TO authenticated;

-- Drop the overly permissive policies on the departments table
DROP POLICY IF EXISTS "Admin puede ver departamentos" ON public.departments;
DROP POLICY IF EXISTS "Anon can view departments by token" ON public.departments;

-- Create a restrictive policy for admins only on the full table
CREATE POLICY "Only admins can view full departments"
ON public.departments
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));