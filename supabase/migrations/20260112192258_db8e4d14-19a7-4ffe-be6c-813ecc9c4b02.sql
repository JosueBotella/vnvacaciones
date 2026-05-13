-- Allow unauthenticated users to read departments (required for public forms and labor module UI)
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='departments'
      AND policyname='Public can view departments'
  ) THEN
    CREATE POLICY "Public can view departments"
    ON public.departments
    FOR SELECT
    TO public
    USING (true);
  END IF;
END $$;