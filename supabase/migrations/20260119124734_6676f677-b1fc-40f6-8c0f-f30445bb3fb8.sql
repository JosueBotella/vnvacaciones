-- =====================================================
-- FASE 2: CORRECCIÓN DE POLÍTICAS RLS PERMISIVAS
-- Eliminamos INSERT/UPDATE/DELETE con WITH CHECK (true)
-- y las reemplazamos por políticas más restrictivas
-- =====================================================

-- 1. vacation_requests: Eliminar INSERT anónimo permisivo
-- Las inserciones solo deben ser vía edge function (service role)
DROP POLICY IF EXISTS "Anon can insert vacation requests" ON public.vacation_requests;
DROP POLICY IF EXISTS "Auth can insert vacation requests" ON public.vacation_requests;

-- 2. vacation_request_dates: Eliminar INSERT anónimo permisivo
DROP POLICY IF EXISTS "Anon can insert request dates" ON public.vacation_request_dates;
DROP POLICY IF EXISTS "Auth can insert request dates" ON public.vacation_request_dates;

-- 3. day_exception_requests: Eliminar INSERT anónimo permisivo
DROP POLICY IF EXISTS "Anon can insert exception requests" ON public.day_exception_requests;

-- 4. department_correction_requests: Eliminar INSERT anónimo permisivo
DROP POLICY IF EXISTS "Anon can insert department correction requests" ON public.department_correction_requests;

-- 5. group_join_requests: Eliminar INSERT anónimo permisivo
DROP POLICY IF EXISTS "Anon can insert group join requests" ON public.group_join_requests;

-- 6. justificante_audit_logs: Mantener solo para service role
DROP POLICY IF EXISTS "Service can insert audit logs" ON public.justificante_audit_logs;

-- 7. justificante_documentos: Eliminar INSERT permisivo para authenticated
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.justificante_documentos;

-- 8. justificantes: Eliminar INSERT permisivo
DROP POLICY IF EXISTS "Allow insert via edge function" ON public.justificantes;

-- 9. labor_incident_alerts: Eliminar INSERT permisivo
DROP POLICY IF EXISTS "Admins can insert alerts" ON public.labor_incident_alerts;

-- 10. login_attempts: Ya manejado por service role, eliminar política permisiva
DROP POLICY IF EXISTS "System can manage login attempts" ON public.login_attempts;

-- 11. security_events: Ya manejado por service role, eliminar política permisiva
DROP POLICY IF EXISTS "System can insert security events" ON public.security_events;

-- =====================================================
-- NOTA IMPORTANTE: Estas tablas NO tendrán políticas de INSERT
-- porque todas las inserciones se realizan mediante edge functions
-- que usan el service role key (bypasses RLS)
-- =====================================================

-- Verificar que RLS sigue habilitado en todas las tablas
ALTER TABLE public.vacation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_request_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_exception_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.justificante_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.justificante_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.justificantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_incident_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;