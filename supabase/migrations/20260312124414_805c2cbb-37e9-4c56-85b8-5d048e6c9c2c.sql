-- Create a storage bucket for temporary invoice PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('invoice-pdfs', 'invoice-pdfs', false, 20971520)
ON CONFLICT (id) DO NOTHING;

-- Allow anon to upload and read from invoice-pdfs bucket
CREATE POLICY "Allow anon upload invoice pdfs"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'invoice-pdfs');

CREATE POLICY "Allow anon read invoice pdfs"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'invoice-pdfs');

CREATE POLICY "Allow anon delete invoice pdfs"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'invoice-pdfs');