
-- Table to store custom AI instructions for email drafting
CREATE TABLE public.incidencias_ai_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instrucciones_custom TEXT NOT NULL DEFAULT '',
  tono TEXT NOT NULL DEFAULT 'formal',
  incluir_articulos BOOLEAN NOT NULL DEFAULT true,
  idioma TEXT NOT NULL DEFAULT 'es',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- Enable RLS
ALTER TABLE public.incidencias_ai_config ENABLE ROW LEVEL SECURITY;

-- Only accessible via service role (edge functions)
CREATE POLICY "Service role only" ON public.incidencias_ai_config FOR ALL USING (false);

-- Insert default row
INSERT INTO public.incidencias_ai_config (instrucciones_custom, tono) VALUES ('', 'formal');
