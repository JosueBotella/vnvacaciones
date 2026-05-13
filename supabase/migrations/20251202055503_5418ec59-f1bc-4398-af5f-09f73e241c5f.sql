-- Agregar email del encargado a departamentos
ALTER TABLE public.departments 
ADD COLUMN IF NOT EXISTS manager_email TEXT;

-- Agregar campos de aprobación en dos niveles a solicitudes
ALTER TABLE public.vacation_requests 
ADD COLUMN IF NOT EXISTS manager_status TEXT DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS manager_rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS admin_rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS manager_approved_at TIMESTAMP WITH TIME ZONE;

-- Crear índice para filtrado eficiente
CREATE INDEX IF NOT EXISTS idx_vacation_requests_manager_status 
ON public.vacation_requests(manager_status);

CREATE INDEX IF NOT EXISTS idx_vacation_requests_department_status 
ON public.vacation_requests(department_id, status, manager_status);

-- Actualizar política de inserción para permitir crear solicitudes públicamente
DROP POLICY IF EXISTS "Público puede crear solicitudes" ON public.vacation_requests;
CREATE POLICY "Público puede crear solicitudes"
  ON public.vacation_requests FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Público puede crear fechas de solicitudes" ON public.vacation_request_dates;
CREATE POLICY "Público puede crear fechas de solicitudes"
  ON public.vacation_request_dates FOR INSERT
  WITH CHECK (true);

-- Permitir actualización de solicitudes (para el botón de editar)
CREATE POLICY "Público puede actualizar sus propias solicitudes"
  ON public.vacation_requests FOR UPDATE
  USING (true)
  WITH CHECK (true);