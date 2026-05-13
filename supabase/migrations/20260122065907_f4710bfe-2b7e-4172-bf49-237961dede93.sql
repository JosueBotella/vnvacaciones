-- =====================================================
-- SISTEMA DE TEST PSICOTÉCNICO - TABLAS PRINCIPALES
-- =====================================================

-- 1. Tabla de configuración de tests
CREATE TABLE public.psico_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  time_limit_minutes INTEGER DEFAULT 15,
  questions_count INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  target_positions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Banco de preguntas
CREATE TABLE public.psico_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES public.psico_tests(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('logica_numerica', 'razonamiento_visual', 'atencion_percepcion', 'logica_verbal', 'velocidad', 'memoria_visual', 'consistencia')),
  question_type TEXT NOT NULL CHECK (question_type IN ('single_choice', 'image_choice', 'memory', 'sequence')),
  question_text TEXT NOT NULL,
  question_data JSONB NOT NULL DEFAULT '{}',
  correct_answer TEXT NOT NULL,
  difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  time_limit_seconds INTEGER DEFAULT 45,
  points INTEGER DEFAULT 1,
  consistency_pair_id UUID,
  order_index INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Sesiones de candidatos
CREATE TABLE public.psico_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES public.psico_tests(id) ON DELETE SET NULL,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT,
  candidate_phone TEXT,
  position_applied TEXT NOT NULL,
  access_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_time_seconds INTEGER,
  current_question_index INTEGER DEFAULT 0,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Respuestas del candidato
CREATE TABLE public.psico_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.psico_sessions(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES public.psico_questions(id) ON DELETE CASCADE NOT NULL,
  answer_given TEXT,
  is_correct BOOLEAN,
  time_taken_seconds INTEGER,
  answered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, question_id)
);

-- 5. Resultados calculados
CREATE TABLE public.psico_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.psico_sessions(id) ON DELETE CASCADE UNIQUE NOT NULL,
  total_questions INTEGER NOT NULL,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  incorrect_answers INTEGER NOT NULL DEFAULT 0,
  unanswered INTEGER NOT NULL DEFAULT 0,
  accuracy_percentage DECIMAL(5,2) DEFAULT 0,
  average_time_per_question DECIMAL(8,2) DEFAULT 0,
  speed_index DECIMAL(5,2) DEFAULT 0,
  consistency_index DECIMAL(5,2) DEFAULT 100,
  cognitive_profile TEXT CHECK (cognitive_profile IN ('rapido_preciso', 'rapido_impulsivo', 'lento_preciso', 'desorganizado', 'equilibrado')),
  recommendation TEXT CHECK (recommendation IN ('muy_recomendable', 'recomendable_reservas', 'no_recomendable')),
  category_scores JSONB DEFAULT '{}',
  detailed_analysis JSONB DEFAULT '{}',
  ai_insights TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- ÍNDICES
-- =====================================================
CREATE INDEX idx_psico_questions_test_id ON public.psico_questions(test_id);
CREATE INDEX idx_psico_questions_category ON public.psico_questions(category);
CREATE INDEX idx_psico_sessions_access_code ON public.psico_sessions(access_code);
CREATE INDEX idx_psico_sessions_status ON public.psico_sessions(status);
CREATE INDEX idx_psico_sessions_created_at ON public.psico_sessions(created_at DESC);
CREATE INDEX idx_psico_answers_session_id ON public.psico_answers(session_id);
CREATE INDEX idx_psico_results_session_id ON public.psico_results(session_id);

-- =====================================================
-- TRIGGERS PARA updated_at
-- =====================================================
CREATE TRIGGER update_psico_tests_updated_at
  BEFORE UPDATE ON public.psico_tests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_psico_sessions_updated_at
  BEFORE UPDATE ON public.psico_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_psico_results_updated_at
  BEFORE UPDATE ON public.psico_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- psico_tests: Solo admins pueden gestionar, lectura pública para tests activos
ALTER TABLE public.psico_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active tests" ON public.psico_tests
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage tests" ON public.psico_tests
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- psico_questions: Solo admins gestionan, acceso vía edge function para candidatos
ALTER TABLE public.psico_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage questions" ON public.psico_questions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- psico_sessions: Candidatos solo ven su sesión, admins ven todo
ALTER TABLE public.psico_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all sessions" ON public.psico_sessions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- psico_answers: Solo acceso vía edge function
ALTER TABLE public.psico_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all answers" ON public.psico_answers
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- psico_results: Solo admins pueden ver resultados
ALTER TABLE public.psico_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all results" ON public.psico_results
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage results" ON public.psico_results
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- TEST POR DEFECTO
-- =====================================================
INSERT INTO public.psico_tests (id, name, description, time_limit_minutes, questions_count, is_active, target_positions)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Test Psicotécnico General',
  'Evaluación completa de agilidad mental, lógica, atención, razonamiento abstracto, intuición, comprensión verbal y velocidad de procesamiento.',
  15,
  30,
  true,
  ARRAY['Comercial', 'Técnico', 'Gestión', 'Producción', 'Logística', 'Administración']
);