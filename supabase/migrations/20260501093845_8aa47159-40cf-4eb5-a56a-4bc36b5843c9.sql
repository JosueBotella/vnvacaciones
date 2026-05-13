-- Etiquetas asignables a equipos (lugar/función rotable)
CREATE TABLE public.worker_team_labels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_worker_team_labels_dept_name
  ON public.worker_team_labels (department_id, lower(name));

CREATE INDEX idx_worker_team_labels_dept ON public.worker_team_labels (department_id, sort_order);

ALTER TABLE public.worker_team_labels ENABLE ROW LEVEL SECURITY;

-- Lectura abierta a usuarios autenticados (mismo patrón que worker_teams)
CREATE POLICY "Authenticated can read team labels"
  ON public.worker_team_labels FOR SELECT
  USING (true);

-- Solo admins pueden modificar (las acciones críticas pasan por edge functions con service role)
CREATE POLICY "Admins can manage team labels"
  ON public.worker_team_labels FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_worker_team_labels_updated_at
  BEFORE UPDATE ON public.worker_team_labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Asignación: una etiqueta por equipo (suficiente; rotable cambiando label_id)
ALTER TABLE public.worker_teams
  ADD COLUMN label_id uuid REFERENCES public.worker_team_labels(id) ON DELETE SET NULL;

CREATE INDEX idx_worker_teams_label_id ON public.worker_teams (label_id);