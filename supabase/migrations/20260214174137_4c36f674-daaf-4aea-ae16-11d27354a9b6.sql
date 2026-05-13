
-- Paso 3: Corregir vistas SECURITY DEFINER → SECURITY INVOKER

DROP VIEW IF EXISTS public.managers_public;
CREATE VIEW public.managers_public WITH (security_invoker = on) AS
  SELECT id, name, role, department_id, created_at
  FROM public.managers;

DROP VIEW IF EXISTS public.departments_public;
CREATE VIEW public.departments_public WITH (security_invoker = on) AS
  SELECT id, name, description, slug, public_token, max_days_per_employee, require_all_days, created_at, updated_at
  FROM public.departments;

-- Paso 4: Restringir política permisiva de weekly_shift_configs
DROP POLICY IF EXISTS "Allow all for service role" ON public.weekly_shift_configs;

CREATE POLICY "Only admins can manage shift configs"
  ON public.weekly_shift_configs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
