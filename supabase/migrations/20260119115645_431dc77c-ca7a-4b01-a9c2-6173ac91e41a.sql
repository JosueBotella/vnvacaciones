-- =============================================
-- SISTEMA DE SEGURIDAD VNProd - Migración Completa
-- =============================================

-- 1. Crear enum de roles del sistema
CREATE TYPE public.system_role AS ENUM (
  'admin_principal',
  'rrhh',
  'encargado',
  'empleado',
  'consulta'
);

-- 2. Tabla de roles del sistema
CREATE TABLE public.system_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('manager', 'worker', 'rrhh')),
  role system_role NOT NULL DEFAULT 'empleado',
  assigned_by TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_identifier, user_type)
);

ALTER TABLE public.system_user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage system roles"
  ON public.system_user_roles FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Tabla de eventos de seguridad
CREATE TABLE public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  actor_id TEXT,
  actor_type TEXT,
  target_id TEXT,
  target_type TEXT,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_events_type ON public.security_events(event_type);
CREATE INDEX idx_security_events_created ON public.security_events(created_at DESC);
CREATE INDEX idx_security_events_severity ON public.security_events(severity);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view security events"
  ON public.security_events FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert security events"
  ON public.security_events FOR INSERT
  WITH CHECK (true);

-- 4. Tabla de intentos de login (rate limiting)
CREATE TABLE public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL,
  ip_address TEXT,
  attempted_at TIMESTAMPTZ DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_login_attempts_user ON public.login_attempts(user_identifier, attempted_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can manage login attempts"
  ON public.login_attempts FOR ALL
  WITH CHECK (true);

-- 5. Función para verificar rol del sistema
CREATE OR REPLACE FUNCTION public.has_system_role(
  p_user_id TEXT, 
  p_user_type TEXT, 
  p_required_role system_role
) RETURNS BOOLEAN AS $$
DECLARE
  v_role system_role;
  v_hierarchy INTEGER;
  v_required_hierarchy INTEGER;
BEGIN
  SELECT role INTO v_role
  FROM public.system_user_roles
  WHERE user_identifier = p_user_id
    AND user_type = p_user_type;
  
  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;
  
  v_hierarchy := CASE v_role
    WHEN 'admin_principal' THEN 5
    WHEN 'rrhh' THEN 4
    WHEN 'encargado' THEN 3
    WHEN 'consulta' THEN 2
    WHEN 'empleado' THEN 1
    ELSE 0
  END;
  
  v_required_hierarchy := CASE p_required_role
    WHEN 'admin_principal' THEN 5
    WHEN 'rrhh' THEN 4
    WHEN 'encargado' THEN 3
    WHEN 'consulta' THEN 2
    WHEN 'empleado' THEN 1
    ELSE 0
  END;
  
  RETURN v_hierarchy >= v_required_hierarchy;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 6. Función para limpiar intentos de login antiguos
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM public.login_attempts 
  WHERE attempted_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Migrar roles existentes de managers a system_user_roles
INSERT INTO public.system_user_roles (user_identifier, user_type, role, assigned_by)
SELECT 
  id::text,
  'manager',
  CASE 
    WHEN role = 'admin' THEN 'admin_principal'::system_role
    WHEN role = 'consulta' THEN 'consulta'::system_role
    ELSE 'encargado'::system_role
  END,
  'system_migration'
FROM public.managers
ON CONFLICT (user_identifier, user_type) DO NOTHING;

-- 8. Migrar roles existentes de rrhh_users a system_user_roles
INSERT INTO public.system_user_roles (user_identifier, user_type, role, assigned_by)
SELECT 
  id::text,
  'rrhh',
  'rrhh'::system_role,
  'system_migration'
FROM public.rrhh_users
ON CONFLICT (user_identifier, user_type) DO NOTHING;