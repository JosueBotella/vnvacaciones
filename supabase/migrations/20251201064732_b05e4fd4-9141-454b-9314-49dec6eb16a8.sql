-- Eliminar políticas restrictivas existentes
DROP POLICY IF EXISTS "Público puede ver departamento por token" ON public.departments;
DROP POLICY IF EXISTS "Público puede ver disponibilidades" ON public.department_availabilities;

-- Crear políticas permisivas para acceso público
CREATE POLICY "Público puede ver departamento por token"
  ON public.departments FOR SELECT
  USING (true);

CREATE POLICY "Público puede ver disponibilidades"
  ON public.department_availabilities FOR SELECT
  USING (true);