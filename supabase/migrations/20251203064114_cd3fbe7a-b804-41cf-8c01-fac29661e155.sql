-- Fix SELECT policies for departments to use anon role
DROP POLICY IF EXISTS "Público puede ver departamento por token" ON public.departments;

CREATE POLICY "Anon can view departments by token" ON public.departments
AS PERMISSIVE
FOR SELECT
TO anon
USING (true);

-- Fix SELECT policies for department_availabilities
DROP POLICY IF EXISTS "Público puede ver disponibilidades" ON public.department_availabilities;

CREATE POLICY "Anon can view availabilities" ON public.department_availabilities
AS PERMISSIVE
FOR SELECT
TO anon
USING (true);

-- Also ensure vacation_requests can be read by authenticated users (for admin)
CREATE POLICY "Anon can view vacation requests" ON public.vacation_requests
AS PERMISSIVE
FOR SELECT
TO anon
USING (true);