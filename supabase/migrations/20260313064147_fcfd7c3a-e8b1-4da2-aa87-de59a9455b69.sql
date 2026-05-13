INSERT INTO storage.buckets (id, name, public)
VALUES ('operativa-capturas', 'operativa-capturas', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service role full access on operativa-capturas"
ON storage.objects FOR ALL
USING (bucket_id = 'operativa-capturas')
WITH CHECK (bucket_id = 'operativa-capturas');