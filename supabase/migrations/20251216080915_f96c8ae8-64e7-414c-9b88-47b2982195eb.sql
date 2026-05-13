-- Create a security definer function to get workers for a department (public access, no PII)
CREATE OR REPLACE FUNCTION public.get_public_workers_by_department(p_department_id uuid)
RETURNS TABLE(id uuid, name text, worker_team_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT w.id, w.name, w.worker_team_id
  FROM workers w
  WHERE w.department_id = p_department_id;
END;
$$;