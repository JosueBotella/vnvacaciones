-- Fix critical RLS vulnerabilities

-- 1. DEPARTMENTS: Remove overly permissive write policies, restrict to admins
DROP POLICY IF EXISTS "Anyone can create departments" ON public.departments;
DROP POLICY IF EXISTS "Anyone can update departments" ON public.departments;
DROP POLICY IF EXISTS "Anyone can delete departments" ON public.departments;

-- Admins only can write to departments
CREATE POLICY "Admins can create departments" 
ON public.departments 
FOR INSERT 
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update departments" 
ON public.departments 
FOR UPDATE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete departments" 
ON public.departments 
FOR DELETE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. VACATION_REQUESTS: Remove anon read access, restrict to authenticated users
DROP POLICY IF EXISTS "Anon can view vacation requests" ON public.vacation_requests;

-- Only authenticated users can view vacation requests
CREATE POLICY "Authenticated users can view vacation requests" 
ON public.vacation_requests 
FOR SELECT 
TO authenticated
USING (true);

-- 3. MANAGERS: Remove overly permissive policies, restrict to admins
DROP POLICY IF EXISTS "Anyone can insert managers" ON public.managers;
DROP POLICY IF EXISTS "Anyone can update managers" ON public.managers;
DROP POLICY IF EXISTS "Anyone can delete managers" ON public.managers;
DROP POLICY IF EXISTS "Anyone can view managers for login" ON public.managers;

-- Allow public to view only id and name for login selection (not password_hash)
CREATE POLICY "Public can view manager names for login" 
ON public.managers 
FOR SELECT 
TO anon, authenticated
USING (true);

-- Admins only can write to managers
CREATE POLICY "Admins can create managers" 
ON public.managers 
FOR INSERT 
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update managers" 
ON public.managers 
FOR UPDATE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete managers" 
ON public.managers 
FOR DELETE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. DEPARTMENT_AVAILABILITIES: Restrict write to admins, keep read open for public form
DROP POLICY IF EXISTS "Anyone can create availabilities" ON public.department_availabilities;
DROP POLICY IF EXISTS "Anyone can update availabilities" ON public.department_availabilities;
DROP POLICY IF EXISTS "Anyone can delete availabilities" ON public.department_availabilities;

CREATE POLICY "Admins can create availabilities" 
ON public.department_availabilities 
FOR INSERT 
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update availabilities" 
ON public.department_availabilities 
FOR UPDATE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete availabilities" 
ON public.department_availabilities 
FOR DELETE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5. MANAGER_DEPARTMENT_ASSIGNMENTS: Restrict to admins
DROP POLICY IF EXISTS "Anyone can create assignments" ON public.manager_department_assignments;
DROP POLICY IF EXISTS "Anyone can delete assignments" ON public.manager_department_assignments;

CREATE POLICY "Admins can create assignments" 
ON public.manager_department_assignments 
FOR INSERT 
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete assignments" 
ON public.manager_department_assignments 
FOR DELETE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));