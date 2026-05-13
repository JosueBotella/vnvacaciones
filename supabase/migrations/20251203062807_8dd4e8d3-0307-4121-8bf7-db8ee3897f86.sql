-- Drop restrictive policies and create permissive ones for departments
DROP POLICY IF EXISTS "Admin puede crear departamentos" ON public.departments;
DROP POLICY IF EXISTS "Admin puede actualizar departamentos" ON public.departments;
DROP POLICY IF EXISTS "Admin puede eliminar departamentos" ON public.departments;

-- Create permissive policies (app handles auth via manager system)
CREATE POLICY "Anyone can create departments" ON public.departments
FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update departments" ON public.departments
FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete departments" ON public.departments
FOR DELETE USING (true);

-- Also fix managers table policies
DROP POLICY IF EXISTS "Admins can manage managers" ON public.managers;

CREATE POLICY "Anyone can insert managers" ON public.managers
FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update managers" ON public.managers
FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete managers" ON public.managers
FOR DELETE USING (true);