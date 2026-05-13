-- Permitir a usuarios anónimos insertar solicitudes de vacaciones
DROP POLICY IF EXISTS "Anyone can create vacation requests" ON public.vacation_requests;

CREATE POLICY "Anyone can create vacation requests"
ON public.vacation_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Permitir a usuarios anónimos insertar fechas de solicitud
DROP POLICY IF EXISTS "Anyone can create vacation request dates" ON public.vacation_request_dates;

CREATE POLICY "Anyone can create vacation request dates"
ON public.vacation_request_dates
FOR INSERT
TO anon, authenticated
WITH CHECK (true);