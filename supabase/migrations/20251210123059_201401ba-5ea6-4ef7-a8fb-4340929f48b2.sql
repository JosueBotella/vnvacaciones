-- Drop and recreate the function with correct max_days type (NUMERIC instead of INTEGER)
DROP FUNCTION IF EXISTS public.get_personal_calendar_public(text);

CREATE OR REPLACE FUNCTION public.get_personal_calendar_public(p_token text)
 RETURNS TABLE(id uuid, department_id uuid, worker_name text, worker_number text, max_days NUMERIC, slug text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    pc.id,
    pc.department_id,
    pc.worker_name,
    pc.worker_number,
    pc.max_days,
    pc.slug
  FROM personal_calendars pc
  WHERE pc.public_token = p_token OR pc.slug = p_token;
END;
$function$;