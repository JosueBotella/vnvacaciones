-- Fix: Replace permissive public policy on incidencias_propuestas_changelog with admin-only
DROP POLICY IF EXISTS "Allow all access to changelog" ON public.incidencias_propuestas_changelog;

CREATE POLICY "Only admins can access changelog"
  ON public.incidencias_propuestas_changelog
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));