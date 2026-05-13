DROP FUNCTION IF EXISTS public.get_public_managers();

CREATE OR REPLACE FUNCTION public.get_public_managers()
 RETURNS TABLE(id uuid, name text, role text, department_id uuid, created_at timestamp with time zone, email text, worker_id uuid, worker_team_id uuid, candidaturas_only boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.id, m.name, m.role, m.department_id, m.created_at, m.email, m.worker_id, m.worker_team_id,
         COALESCE(m.candidaturas_only, false) AS candidaturas_only
  FROM public.managers m
  ORDER BY 
    CASE WHEN m.role = 'admin' THEN 0 WHEN m.role = 'manager' THEN 1 WHEN m.role = 'consulta' THEN 2 ELSE 3 END,
    m.name ASC
$function$;