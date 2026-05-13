-- Tabla para grupos de rotación de horarios personalizados
CREATE TABLE public.personal_schedule_rotation_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rotation_enabled BOOLEAN NOT NULL DEFAULT true,
  base_week INTEGER NOT NULL DEFAULT 1,
  base_year INTEGER NOT NULL DEFAULT 2025,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para horarios personalizados por trabajador
CREATE TABLE public.personal_work_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  rotation_group_id UUID REFERENCES public.personal_schedule_rotation_groups(id) ON DELETE SET NULL,
  rotation_position INTEGER NOT NULL DEFAULT 0,
  schedule_template JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(worker_id)
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_personal_work_schedules_worker ON public.personal_work_schedules(worker_id);
CREATE INDEX idx_personal_work_schedules_rotation_group ON public.personal_work_schedules(rotation_group_id);
CREATE INDEX idx_personal_schedule_rotation_groups_dept ON public.personal_schedule_rotation_groups(department_id);

-- Enable RLS
ALTER TABLE public.personal_schedule_rotation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_work_schedules ENABLE ROW LEVEL SECURITY;

-- Admin/manager read policies
CREATE POLICY "Service role full access" ON public.personal_schedule_rotation_groups
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON public.personal_work_schedules
  FOR ALL USING (true) WITH CHECK (true);

-- Triggers para updated_at
CREATE TRIGGER update_personal_schedule_rotation_groups_updated_at
  BEFORE UPDATE ON public.personal_schedule_rotation_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_personal_work_schedules_updated_at
  BEFORE UPDATE ON public.personal_work_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();