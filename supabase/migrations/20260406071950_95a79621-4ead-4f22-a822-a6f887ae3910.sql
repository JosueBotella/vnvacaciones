-- Fix 1: Replace permissive public policy on incidencias_category_tags with admin-only
DROP POLICY IF EXISTS "Allow all access to category tags" ON public.incidencias_category_tags;

CREATE POLICY "Only admins can manage category tags"
  ON public.incidencias_category_tags
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Block anon access to managers table explicitly
CREATE POLICY "Block anon access to managers"
  ON public.managers
  FOR ALL
  TO anon
  USING (false);