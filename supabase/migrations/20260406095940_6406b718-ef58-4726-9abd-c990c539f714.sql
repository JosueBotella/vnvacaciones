-- Fix: Replace permissive INSERT policy on backups bucket
DROP POLICY IF EXISTS "Only service role can upload backups" ON storage.objects;

CREATE POLICY "Only admins can upload backups"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'backups' AND has_role(auth.uid(), 'admin'::app_role));