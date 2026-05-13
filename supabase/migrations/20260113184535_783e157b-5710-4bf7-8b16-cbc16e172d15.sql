-- Create table for documentation thread/history
CREATE TABLE public.justificante_documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  justificante_id UUID NOT NULL REFERENCES public.justificantes(id) ON DELETE CASCADE,
  tipo_mensaje TEXT NOT NULL CHECK (tipo_mensaje IN ('solicitud_docs', 'respuesta_docs')),
  mensaje TEXT,
  archivo_url TEXT,
  archivo_nombre TEXT,
  archivo_tipo TEXT,
  actor_nombre TEXT NOT NULL,
  actor_rol TEXT NOT NULL CHECK (actor_rol IN ('admin', 'rrhh', 'trabajador')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.justificante_documentos ENABLE ROW LEVEL SECURITY;

-- Index for faster lookups by justificante
CREATE INDEX idx_justificante_documentos_justificante_id ON public.justificante_documentos(justificante_id);
CREATE INDEX idx_justificante_documentos_created_at ON public.justificante_documentos(created_at);

-- RLS: Allow authenticated users to read (edge function will handle the actual access control)
CREATE POLICY "Allow read access for authenticated users" 
ON public.justificante_documentos 
FOR SELECT 
TO authenticated 
USING (true);

-- RLS: Allow insert for authenticated users (edge function handles validation)
CREATE POLICY "Allow insert for authenticated users" 
ON public.justificante_documentos 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Add column to track if justificante has pending documentation request
ALTER TABLE public.justificantes ADD COLUMN IF NOT EXISTS pending_docs_request BOOLEAN DEFAULT false;
ALTER TABLE public.justificantes ADD COLUMN IF NOT EXISTS last_doc_request_message TEXT;