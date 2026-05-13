-- Create psico test questions table
CREATE TABLE IF NOT EXISTS public.psico_test_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID REFERENCES public.psico_tests(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice',
  question_text TEXT NOT NULL,
  question_data JSONB DEFAULT '{}',
  correct_answer TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  time_limit_seconds INTEGER DEFAULT 45,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.psico_test_questions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view questions" ON public.psico_test_questions
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage questions" ON public.psico_test_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );