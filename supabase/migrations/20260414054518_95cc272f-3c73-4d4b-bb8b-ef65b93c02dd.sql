
-- Add document_code column
ALTER TABLE public.incidencias_legal_documents
ADD COLUMN IF NOT EXISTS document_code TEXT;

-- Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_docs_document_code
ON public.incidencias_legal_documents (document_code)
WHERE document_code IS NOT NULL;

-- Backfill existing documents
UPDATE public.incidencias_legal_documents
SET document_code = 
  CASE 
    WHEN tipo = 'sancion' THEN 'SAN-'
    ELSE 'AMO-'
  END
  || to_char(created_at, 'YYYYMMDD') || '-'
  || upper(substring(id::text from 1 for 4))
WHERE document_code IS NULL;
