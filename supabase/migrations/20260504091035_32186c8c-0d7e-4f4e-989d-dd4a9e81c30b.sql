CREATE TABLE public.incidencias_bulk_scan_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.managers(id) ON DELETE SET NULL,
  pdf_filename text,
  total_pages integer,
  initial_assignments jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_assignments jsonb NOT NULL DEFAULT '[]'::jsonb,
  correction_chat jsonb NOT NULL DEFAULT '[]'::jsonb,
  lessons text
);

ALTER TABLE public.incidencias_bulk_scan_corrections ENABLE ROW LEVEL SECURITY;

-- Authenticated managers/admins can read
CREATE POLICY "Authenticated can read bulk scan corrections"
ON public.incidencias_bulk_scan_corrections
FOR SELECT
TO authenticated
USING (true);

-- Authenticated can insert (server uses service role anyway, but allow for direct calls)
CREATE POLICY "Authenticated can insert bulk scan corrections"
ON public.incidencias_bulk_scan_corrections
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE INDEX idx_bulk_scan_corrections_created_at
ON public.incidencias_bulk_scan_corrections (created_at DESC);