-- 1. Schema additions
ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS assigned_manager_id UUID NULL REFERENCES public.managers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_interviews_assigned_manager_id
  ON public.interviews(assigned_manager_id);

-- 2. Storage bucket for manager avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('manager-avatars', 'manager-avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Manager avatars are publicly readable" ON storage.objects;
CREATE POLICY "Manager avatars are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'manager-avatars');

DROP POLICY IF EXISTS "Block client writes to manager-avatars" ON storage.objects;
CREATE POLICY "Block client writes to manager-avatars"
ON storage.objects FOR INSERT
TO authenticated, anon
WITH CHECK (bucket_id <> 'manager-avatars');

-- 3. Update get_public_managers (return type changed → must DROP first)
DROP FUNCTION IF EXISTS public.get_public_managers();

CREATE OR REPLACE FUNCTION public.get_public_managers()
 RETURNS TABLE(id uuid, name text, role text, department_id uuid, created_at timestamp with time zone, email text, worker_id uuid, worker_team_id uuid, candidaturas_only boolean, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.id, m.name, m.role, m.department_id, m.created_at, m.email, m.worker_id, m.worker_team_id,
         COALESCE(m.candidaturas_only, false) AS candidaturas_only,
         m.avatar_url
  FROM public.managers m
  ORDER BY 
    CASE WHEN m.role = 'admin' THEN 0 WHEN m.role = 'manager' THEN 1 WHEN m.role = 'consulta' THEN 2 ELSE 3 END,
    m.name ASC
$function$;