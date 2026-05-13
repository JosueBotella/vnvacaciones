-- Permitir a admin eliminar solicitudes de vacaciones
CREATE POLICY "Admin puede eliminar solicitudes"
ON public.vacation_requests
FOR DELETE
TO authenticated
USING (true);

-- Permitir a admin eliminar fechas de solicitudes
CREATE POLICY "Admin puede eliminar fechas de solicitudes"
ON public.vacation_request_dates
FOR DELETE
TO authenticated
USING (true);