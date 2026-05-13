-- Ensure departments_public view also has proper permissions
GRANT SELECT ON public.departments_public TO anon;
GRANT SELECT ON public.departments_public TO authenticated;