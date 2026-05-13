
-- Remove existing permissive policies on invoice-pdfs bucket
DROP POLICY IF EXISTS "Allow public read invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete invoice PDFs" ON storage.objects;

-- Create admin-only policies for invoice-pdfs bucket
CREATE POLICY "Admins can read invoice PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoice-pdfs' AND
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can upload invoice PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoice-pdfs' AND
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete invoice PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoice-pdfs' AND
  public.has_role(auth.uid(), 'admin'::public.app_role)
);
