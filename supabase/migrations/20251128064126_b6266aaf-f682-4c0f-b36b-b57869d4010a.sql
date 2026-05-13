-- Crear tabla de departamentos
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  slug text,
  public_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  max_days_per_employee integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para búsquedas rápidas por token público
CREATE INDEX idx_departments_public_token ON public.departments(public_token);

-- Tabla de días disponibles por departamento
CREATE TABLE public.department_availabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(department_id, date)
);

CREATE INDEX idx_department_availabilities_dept_date ON public.department_availabilities(department_id, date);

-- Tabla de solicitudes de vacaciones
CREATE TABLE public.vacation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  employee_email text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vacation_requests_department ON public.vacation_requests(department_id);
CREATE INDEX idx_vacation_requests_status ON public.vacation_requests(status);

-- Tabla de fechas individuales por solicitud
CREATE TABLE public.vacation_request_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacation_request_id uuid NOT NULL REFERENCES public.vacation_requests(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vacation_request_dates_request ON public.vacation_request_dates(vacation_request_id);

-- Habilitar RLS en todas las tablas
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_availabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_request_dates ENABLE ROW LEVEL SECURITY;

-- Políticas para departments (solo admin autenticado puede modificar)
CREATE POLICY "Admin puede ver departamentos"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin puede crear departamentos"
  ON public.departments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admin puede actualizar departamentos"
  ON public.departments FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Admin puede eliminar departamentos"
  ON public.departments FOR DELETE
  TO authenticated
  USING (true);

-- Políticas para department_availabilities (solo admin)
CREATE POLICY "Admin puede ver disponibilidades"
  ON public.department_availabilities FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin puede crear disponibilidades"
  ON public.department_availabilities FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admin puede eliminar disponibilidades"
  ON public.department_availabilities FOR DELETE
  TO authenticated
  USING (true);

-- Políticas para vacation_requests (admin ve todo, público puede insertar)
CREATE POLICY "Admin puede ver todas las solicitudes"
  ON public.vacation_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Público puede crear solicitudes"
  ON public.vacation_requests FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Admin puede actualizar solicitudes"
  ON public.vacation_requests FOR UPDATE
  TO authenticated
  USING (true);

-- Políticas para vacation_request_dates (admin ve todo, público puede insertar)
CREATE POLICY "Admin puede ver fechas de solicitudes"
  ON public.vacation_request_dates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Público puede crear fechas de solicitudes"
  ON public.vacation_request_dates FOR INSERT
  TO anon
  WITH CHECK (true);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at en departments
CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();