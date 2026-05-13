
-- 1. Realtime channel authorization: restrict subscriptions to admins
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can use realtime channels"
  ON realtime.messages
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Storage INSERT policies for private buckets
CREATE POLICY "Admins can upload justificantes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'justificantes' AND
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins can upload incidencias-pruebas"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'incidencias-pruebas' AND
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins can upload incidencias-training-docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'incidencias-training-docs' AND
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins can upload operativa-capturas"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'operativa-capturas' AND
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );
