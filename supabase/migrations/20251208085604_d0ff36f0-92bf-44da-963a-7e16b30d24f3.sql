-- Create a SECURITY DEFINER function to safely expose public manager data
-- This function bypasses RLS on managers table but only exposes safe fields (no password_hash)
CREATE OR REPLACE FUNCTION public.get_public_managers()
RETURNS TABLE (
  id uuid,
  name text,
  role text,
  department_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, role, department_id, created_at
  FROM public.managers
  ORDER BY 
    CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
    name ASC
$$;

-- Create a SECURITY DEFINER function to safely expose public department data
CREATE OR REPLACE FUNCTION public.get_public_departments()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  slug text,
  public_token text,
  max_days_per_employee integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, description, slug, public_token, max_days_per_employee, created_at, updated_at
  FROM public.departments
$$;

-- Grant execute permissions on these functions to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_public_managers() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_managers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_departments() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_departments() TO authenticated;