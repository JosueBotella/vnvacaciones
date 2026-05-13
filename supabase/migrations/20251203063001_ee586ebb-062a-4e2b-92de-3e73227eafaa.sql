-- Fix RLS for department_availabilities - need permissive INSERT policy
DROP POLICY IF EXISTS "Admin puede crear disponibilidades" ON public.department_availabilities;

CREATE POLICY "Anyone can create availabilities" ON public.department_availabilities
FOR INSERT WITH CHECK (true);

-- Also add UPDATE policy if needed
CREATE POLICY "Anyone can update availabilities" ON public.department_availabilities
FOR UPDATE USING (true);

-- And DELETE policy
DROP POLICY IF EXISTS "Admin puede eliminar disponibilidades" ON public.department_availabilities;

CREATE POLICY "Anyone can delete availabilities" ON public.department_availabilities
FOR DELETE USING (true);