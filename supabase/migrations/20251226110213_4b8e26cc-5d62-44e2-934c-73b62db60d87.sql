-- Drop existing function first, then recreate with new return type
DROP FUNCTION IF EXISTS public.get_public_workers_by_department(uuid);

CREATE OR REPLACE FUNCTION public.get_public_workers_by_department(p_department_id uuid)
 RETURNS TABLE(id uuid, name text, worker_team_id uuid, work_group_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT w.id, w.name, w.worker_team_id, w.work_group_id
  FROM workers w
  WHERE w.department_id = p_department_id;
END;
$function$;