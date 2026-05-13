-- Create persistent tokenized links for incidencia attachments
CREATE TABLE IF NOT EXISTS public.incidencias_attachment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.incidencias_propuestas_rrhh(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  file_name TEXT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  CONSTRAINT incidencias_attachment_links_token_length CHECK (char_length(token) >= 32),
  CONSTRAINT incidencias_attachment_links_unique_file UNIQUE (proposal_id, storage_path)
);

ALTER TABLE public.incidencias_attachment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage incidencia attachment links"
ON public.incidencias_attachment_links
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_incidencias_attachment_links_token
ON public.incidencias_attachment_links(token);

CREATE INDEX IF NOT EXISTS idx_incidencias_attachment_links_proposal_id
ON public.incidencias_attachment_links(proposal_id);

CREATE OR REPLACE FUNCTION public.touch_incidencias_attachment_link(_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.incidencias_attachment_links
  SET last_accessed_at = now()
  WHERE token = _token;
END;
$$;