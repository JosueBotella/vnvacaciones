-- Create public bucket for assets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow public read access
CREATE POLICY "Public can read assets" 
ON storage.objects 
FOR SELECT 
TO public
USING (bucket_id = 'assets');