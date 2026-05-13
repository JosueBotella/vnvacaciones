-- Drop the overly permissive policy that allows anyone to view assignments
DROP POLICY IF EXISTS "Anyone can view assignments" ON public.manager_department_assignments;

-- Create a policy that only allows authenticated users to view assignments
CREATE POLICY "Only authenticated users can view assignments"
ON public.manager_department_assignments
FOR SELECT
TO authenticated
USING (true);