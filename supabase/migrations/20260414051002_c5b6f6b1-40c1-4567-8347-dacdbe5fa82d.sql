
CREATE TABLE public.incidencias_legal_document_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.incidencias_legal_documents(id) ON DELETE CASCADE,
  html_content TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  change_description TEXT,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.incidencias_legal_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to legal document versions"
ON public.incidencias_legal_document_versions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_legal_doc_versions_document_id ON public.incidencias_legal_document_versions(document_id);
CREATE INDEX idx_legal_doc_versions_created_at ON public.incidencias_legal_document_versions(created_at DESC);
