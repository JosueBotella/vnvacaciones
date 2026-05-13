
-- Junction table: categories <-> departments (many-to-many)
CREATE TABLE public.incidencias_category_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.incidencias_categories(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.incidencias_departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, department_id)
);

-- Migrate existing department_id data to junction table
INSERT INTO public.incidencias_category_departments (category_id, department_id)
SELECT id, department_id
FROM public.incidencias_categories
WHERE department_id IS NOT NULL;

-- RLS: allow all (accessed via edge functions with service role)
ALTER TABLE public.incidencias_category_departments ENABLE ROW LEVEL SECURITY;
