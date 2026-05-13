-- ==============================================
-- SISTEMA DE TEST PSICOTÉCNICO POR ÁREAS
-- ==============================================

-- 1. Tabla de áreas de test
CREATE TABLE public.psico_test_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'Briefcase',
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.psico_test_areas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Admins can manage areas"
  ON public.psico_test_areas
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view active areas"
  ON public.psico_test_areas
  FOR SELECT
  USING (is_active = true);

-- 2. Añadir campos a psico_tests
ALTER TABLE public.psico_tests 
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.psico_test_areas(id),
  ADD COLUMN IF NOT EXISTS scoring_config JSONB DEFAULT '{}';

-- 3. Añadir campo area_id a psico_sessions
ALTER TABLE public.psico_sessions 
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.psico_test_areas(id);

-- 4. Añadir campo block_name a psico_questions
ALTER TABLE public.psico_questions 
  ADD COLUMN IF NOT EXISTS block_name TEXT;

-- 5. Insertar área de Ventas
INSERT INTO public.psico_test_areas (name, description, icon, is_active, display_order)
VALUES (
  'Ventas / Atención al Cliente',
  'Evaluación para perfiles comerciales B2B, atención al cliente, customer success y soporte comercial.',
  'Phone',
  true,
  1
);

-- 6. Insertar áreas futuras (inactivas)
INSERT INTO public.psico_test_areas (name, description, icon, is_active, display_order)
VALUES 
  ('IT / Desarrollo', 'Evaluación para desarrolladores y perfiles tecnológicos.', 'Code', false, 2),
  ('Operaciones / Logística', 'Evaluación para perfiles de almacén y logística.', 'Package', false, 3),
  ('Gestión / Administración', 'Evaluación para perfiles administrativos.', 'ClipboardList', false, 4);