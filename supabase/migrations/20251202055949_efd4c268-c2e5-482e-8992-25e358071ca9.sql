-- Añadir campo número de fichar a solicitudes de vacaciones
ALTER TABLE public.vacation_requests 
ADD COLUMN IF NOT EXISTS worker_number TEXT NOT NULL DEFAULT '';

-- Crear índice para búsquedas por número de fichar
CREATE INDEX IF NOT EXISTS idx_vacation_requests_worker_number 
ON public.vacation_requests(worker_number);