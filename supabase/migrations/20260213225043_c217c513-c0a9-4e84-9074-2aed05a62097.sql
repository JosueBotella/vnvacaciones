
-- Create table for individual memory entries
CREATE TABLE public.incidencias_ai_memory_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text NOT NULL,
  contenido text NOT NULL,
  categoria text NOT NULL DEFAULT 'general',
  suggested_by_ai boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_ai_memory_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.incidencias_ai_memory_entries FOR ALL USING (false);

CREATE INDEX idx_memory_entries_categoria ON public.incidencias_ai_memory_entries(categoria);
