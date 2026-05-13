
-- Create table for training documents
CREATE TABLE public.incidencias_training_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  storage_path text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  extracted_text text DEFAULT '',
  document_type text NOT NULL DEFAULT 'otro',
  description text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by text DEFAULT ''
);

-- Enable RLS
ALTER TABLE public.incidencias_training_documents ENABLE ROW LEVEL SECURITY;

-- No public policies - only accessible via service role (edge functions)

-- Create private storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('incidencias-training-docs', 'incidencias-training-docs', false);
