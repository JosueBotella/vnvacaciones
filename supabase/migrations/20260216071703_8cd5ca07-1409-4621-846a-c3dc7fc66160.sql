
-- Add email column to managers table
ALTER TABLE public.managers ADD COLUMN IF NOT EXISTS email text;

-- Add unique constraint
DO $$ BEGIN
  ALTER TABLE public.managers ADD CONSTRAINT managers_email_unique UNIQUE (email);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Drop and recreate get_public_managers with email field
DROP FUNCTION IF EXISTS public.get_public_managers();
CREATE FUNCTION public.get_public_managers()
 RETURNS TABLE(id uuid, name text, role text, department_id uuid, created_at timestamp with time zone, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, name, role, department_id, created_at, email
  FROM public.managers
  ORDER BY 
    CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
    name ASC
$function$;
