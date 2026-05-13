
-- Create category tags table for CSV field matching
CREATE TABLE public.incidencias_category_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.incidencias_categories(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, field_name, field_value)
);

ALTER TABLE public.incidencias_category_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to category tags" ON public.incidencias_category_tags
  FOR ALL USING (true) WITH CHECK (true);

-- Add csv_tag_value column to incidencias_records
ALTER TABLE public.incidencias_records ADD COLUMN IF NOT EXISTS csv_tag_value text;
