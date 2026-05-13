-- Drop and recreate the function with the new field
DROP FUNCTION IF EXISTS public.get_public_departments();

CREATE FUNCTION public.get_public_departments()
 RETURNS TABLE(id uuid, name text, description text, slug text, public_token text, max_days_per_employee integer, require_all_days boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, name, description, slug, public_token, max_days_per_employee, require_all_days, created_at, updated_at
  FROM public.departments
$function$;

-- Update the departments_public view to include the new field
DROP VIEW IF EXISTS public.departments_public;
CREATE VIEW public.departments_public AS
SELECT 
  id,
  created_at,
  updated_at,
  description,
  name,
  public_token,
  slug,
  max_days_per_employee,
  require_all_days
FROM public.departments;