-- Drop and recreate the function with correct numeric return type
DROP FUNCTION IF EXISTS public.get_public_departments();

CREATE FUNCTION public.get_public_departments()
RETURNS TABLE(
  id uuid, 
  name text, 
  description text, 
  slug text, 
  public_token text, 
  max_days_per_employee numeric, 
  require_all_days boolean, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT id, name, description, slug, public_token, max_days_per_employee, require_all_days, created_at, updated_at
  FROM public.departments
$function$;