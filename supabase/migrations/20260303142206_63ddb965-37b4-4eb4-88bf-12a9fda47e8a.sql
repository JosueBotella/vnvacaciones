
ALTER TABLE public.incidencias_categories 
ADD COLUMN department_id uuid REFERENCES public.incidencias_departments(id) ON DELETE CASCADE;

-- Make existing categories available to all departments by leaving department_id NULL (global)
-- New categories will require a department_id

CREATE INDEX idx_incidencias_categories_department ON public.incidencias_categories(department_id);
