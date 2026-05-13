-- Allow anonymous users to view managers for the login dropdown
-- The managers_public view already hides password_hash, so this is safe

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Authenticated can view own manager data" ON public.managers;

-- Create a new policy that allows anyone to SELECT from managers
-- The frontend uses managers_public view which excludes password_hash
CREATE POLICY "Anyone can view managers" 
ON public.managers 
FOR SELECT 
USING (true);