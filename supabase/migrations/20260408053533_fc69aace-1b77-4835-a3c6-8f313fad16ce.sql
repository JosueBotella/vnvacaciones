
-- Enums
CREATE TYPE public.gender_type AS ENUM ('male', 'female');
CREATE TYPE public.vehicle_type AS ENUM ('none', 'skate', 'bike', 'car');
CREATE TYPE public.cv_file_type AS ENUM ('pdf', 'image');
CREATE TYPE public.ai_processing_status AS ENUM ('pending', 'processing', 'passed', 'rejected', 'error');
CREATE TYPE public.application_admin_status AS ENUM ('new', 'reviewing', 'shortlisted', 'discarded', 'hired');

-- Job positions table
CREATE TABLE public.job_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT false,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.job_positions ENABLE ROW LEVEL SECURITY;

CREATE VIEW public.active_job_positions AS
  SELECT id, title, description FROM public.job_positions WHERE is_active = true;

-- Applications table
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_position_id UUID REFERENCES public.job_positions(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender public.gender_type NOT NULL,
  origin_country TEXT NOT NULL,
  current_address TEXT NOT NULL,
  current_lat NUMERIC,
  current_lng NUMERIC,
  distance_km NUMERIC,
  vehicle public.vehicle_type NOT NULL DEFAULT 'none'::public.vehicle_type,
  spanish_level INT NOT NULL DEFAULT 1 CHECK (spanish_level >= 1 AND spanish_level <= 5),
  cv_file_url TEXT,
  cv_file_type public.cv_file_type,
  form_language TEXT NOT NULL DEFAULT 'es',
  ai_score INT,
  ai_extracted JSONB,
  ai_summary TEXT,
  ai_status public.ai_processing_status NOT NULL DEFAULT 'pending'::public.ai_processing_status,
  ai_rejection_reasons TEXT[],
  ai_processed_at TIMESTAMPTZ,
  admin_status public.application_admin_status NOT NULL DEFAULT 'new'::public.application_admin_status,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Application events
CREATE TABLE public.application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

-- Trigger
CREATE TRIGGER update_job_positions_updated_at
  BEFORE UPDATE ON public.job_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('cvs', 'cvs', false);

-- RLS: job_positions
CREATE POLICY "Anyone can view active job positions" ON public.job_positions FOR SELECT USING (is_active = true);
CREATE POLICY "Admin full access to job_positions" ON public.job_positions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: applications
CREATE POLICY "Anyone can submit applications" ON public.applications FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can view applications" ON public.applications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update applications" ON public.applications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete applications" ON public.applications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS: application_events
CREATE POLICY "Admin can manage application events" ON public.application_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Storage policies
CREATE POLICY "Anyone can upload CVs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'cvs');
CREATE POLICY "Admin can read CVs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cvs' AND public.has_role(auth.uid(), 'admin'));
