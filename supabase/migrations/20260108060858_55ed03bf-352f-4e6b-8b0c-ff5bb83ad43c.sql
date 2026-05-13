-- Create storage bucket for justificantes
INSERT INTO storage.buckets (id, name, public)
VALUES ('justificantes', 'justificantes', false);

-- Storage RLS policies for justificantes bucket
CREATE POLICY "Employees can upload their own justificantes"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'justificantes' AND
  auth.role() = 'anon'
);

CREATE POLICY "Admins can view all justificantes"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'justificantes' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete justificantes"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'justificantes' AND
  has_role(auth.uid(), 'admin'::app_role)
);

-- Create justificante type enum
CREATE TYPE public.justificante_tipo AS ENUM ('medico', 'personal', 'otro');

-- Create justificante status enum
CREATE TYPE public.justificante_estado AS ENUM ('pendiente', 'gestionado', 'rechazado');

-- Create RRHH user role enum (separate from app_role for clarity)
CREATE TYPE public.rrhh_role AS ENUM ('admin_principal', 'rrhh');

-- Table for RRHH system users (Álvaro and RRHH staff)
CREATE TABLE public.rrhh_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  role rrhh_role NOT NULL DEFAULT 'rrhh',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on rrhh_users
ALTER TABLE public.rrhh_users ENABLE ROW LEVEL SECURITY;

-- Only admins can manage RRHH users
CREATE POLICY "Only admins can view rrhh users"
ON public.rrhh_users FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage rrhh users"
ON public.rrhh_users FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Main justificantes table
CREATE TABLE public.justificantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  worker_number TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  tipo justificante_tipo NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  comentario_empleado TEXT,
  archivo_url TEXT NOT NULL,
  archivo_nombre TEXT NOT NULL,
  archivo_tipo TEXT NOT NULL,
  estado justificante_estado NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on justificantes
ALTER TABLE public.justificantes ENABLE ROW LEVEL SECURITY;

-- Employees can insert their own justificantes (via edge function)
CREATE POLICY "Allow insert via edge function"
ON public.justificantes FOR INSERT
WITH CHECK (true);

-- Only admins can view all justificantes
CREATE POLICY "Admins can view all justificantes"
ON public.justificantes FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update justificantes
CREATE POLICY "Admins can update justificantes"
ON public.justificantes FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete justificantes
CREATE POLICY "Admins can delete justificantes"
ON public.justificantes FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Table for justificante management actions (audit trail)
CREATE TABLE public.justificante_gestiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  justificante_id UUID REFERENCES public.justificantes(id) ON DELETE CASCADE NOT NULL,
  gestionado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  gestionado_por_nombre TEXT NOT NULL,
  accion justificante_estado NOT NULL,
  comentario_gestor TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on justificante_gestiones
ALTER TABLE public.justificante_gestiones ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage gestiones
CREATE POLICY "Admins can view justificante gestiones"
ON public.justificante_gestiones FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert justificante gestiones"
ON public.justificante_gestiones FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add password field to workers table for employee authentication
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Create index for faster queries
CREATE INDEX idx_justificantes_worker_id ON public.justificantes(worker_id);
CREATE INDEX idx_justificantes_department_id ON public.justificantes(department_id);
CREATE INDEX idx_justificantes_estado ON public.justificantes(estado);
CREATE INDEX idx_justificantes_created_at ON public.justificantes(created_at DESC);
CREATE INDEX idx_justificante_gestiones_justificante_id ON public.justificante_gestiones(justificante_id);

-- Update trigger for justificantes
CREATE TRIGGER update_justificantes_updated_at
BEFORE UPDATE ON public.justificantes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();