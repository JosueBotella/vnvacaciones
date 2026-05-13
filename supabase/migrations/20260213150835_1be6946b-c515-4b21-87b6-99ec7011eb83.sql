
-- =============================================
-- Fase 12: Automatizaciones, Notificaciones y Escalado
-- =============================================

-- 1) incidencias_notifications
CREATE TABLE public.incidencias_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'encargado',
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  link text,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_notifications"
  ON public.incidencias_notifications FOR ALL USING (false);

CREATE INDEX idx_incidencias_notifications_user_id ON public.incidencias_notifications(user_id);
CREATE INDEX idx_incidencias_notifications_created_at ON public.incidencias_notifications(created_at DESC);
CREATE INDEX idx_incidencias_notifications_read_at ON public.incidencias_notifications(read_at);

-- 2) incidencias_tasks
CREATE TABLE public.incidencias_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id uuid NOT NULL,
  type text NOT NULL,
  ref_id uuid,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  completed_by text,
  completed_at timestamp with time zone,
  due_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_tasks"
  ON public.incidencias_tasks FOR ALL USING (false);

CREATE INDEX idx_incidencias_tasks_department_id ON public.incidencias_tasks(department_id);
CREATE INDEX idx_incidencias_tasks_status ON public.incidencias_tasks(status);
CREATE INDEX idx_incidencias_tasks_created_at ON public.incidencias_tasks(created_at DESC);

-- 3) incidencias_push_tokens
CREATE TABLE public.incidencias_push_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  device_token text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to incidencias_push_tokens"
  ON public.incidencias_push_tokens FOR ALL USING (false);

CREATE INDEX idx_incidencias_push_tokens_user_id ON public.incidencias_push_tokens(user_id);

-- 4) Enable realtime for notifications and tasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidencias_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidencias_tasks;
