-- Drop the permissive anonymous policy
DROP POLICY IF EXISTS "Anon can view worker comments" ON worker_comments;

-- Ensure only admins can view worker comments (policy already exists: "Admins can manage worker comments")
-- But let's add an explicit SELECT policy for clarity
CREATE POLICY "Only admins can view worker comments"
ON worker_comments
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));