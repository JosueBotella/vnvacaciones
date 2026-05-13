-- Permitir que usuarios anónimos puedan ver solicitudes de vacaciones (necesario para dashboards con auth personalizada)
CREATE POLICY "Anon can view vacation requests" 
ON public.vacation_requests 
FOR SELECT 
TO anon
USING (true);

-- Permitir que usuarios anónimos puedan ver las fechas de solicitudes
CREATE POLICY "Anon can view vacation request dates" 
ON public.vacation_request_dates 
FOR SELECT 
TO anon
USING (true);

-- Permitir que usuarios anónimos puedan actualizar solicitudes (para encargados con auth personalizada)
CREATE POLICY "Anon can update vacation requests" 
ON public.vacation_requests 
FOR UPDATE 
TO anon
USING (true)
WITH CHECK (true);

-- Permitir que usuarios anónimos puedan eliminar solicitudes (para admin con auth personalizada)
CREATE POLICY "Anon can delete vacation requests" 
ON public.vacation_requests 
FOR DELETE 
TO anon
USING (true);

-- Permitir que usuarios anónimos puedan eliminar fechas de solicitudes
CREATE POLICY "Anon can delete vacation request dates" 
ON public.vacation_request_dates 
FOR DELETE 
TO anon
USING (true);