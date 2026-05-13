-- Grant SELECT permissions on managers_public view to anon and authenticated roles
GRANT SELECT ON public.managers_public TO anon;
GRANT SELECT ON public.managers_public TO authenticated;