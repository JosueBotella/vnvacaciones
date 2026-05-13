-- Persist per-document font-size override (live preview tweak)
ALTER TABLE public.incidencias_legal_documents
  ADD COLUMN IF NOT EXISTS font_delta numeric(3,1) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.incidencias_legal_documents.font_delta IS
  'Font-size offset in px applied on top of the template defaults for body text in the preview/PDF (range -3 to +4, step 0.5).';

-- Global default for newly generated legal documents (carries forward last user choice)
ALTER TABLE public.incidencias_ai_config
  ADD COLUMN IF NOT EXISTS default_font_delta numeric(3,1) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.incidencias_ai_config.default_font_delta IS
  'Default font-size offset (px) used when generating new legal documents. Updated whenever an admin saves a document with a custom font scale.';
