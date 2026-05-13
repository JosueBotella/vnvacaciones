
CREATE TABLE public.incidencias_gravedades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  label_plural text NOT NULL,
  color text NOT NULL DEFAULT '#93d600',
  puntos integer NOT NULL DEFAULT 1,
  icon_name text DEFAULT 'Shield',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  importe_min numeric DEFAULT null,
  importe_max numeric DEFAULT null,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.incidencias_gravedades ENABLE ROW LEVEL SECURITY;

INSERT INTO public.incidencias_gravedades (key, label, label_plural, color, puntos, icon_name, sort_order)
VALUES
  ('leve', 'Leve', 'Leves', '#93d600', 1, 'Shield', 0),
  ('moderada', 'Moderada', 'Moderadas', '#fb923c', 10, 'Tag', 1),
  ('grave', 'Grave', 'Graves', '#f59e0b', 25, 'AlertTriangle', 2),
  ('muy_grave', 'Muy grave', 'Muy graves', '#ef4444', 80, 'ShieldAlert', 3);

ALTER TABLE public.incidencias_categories DROP COLUMN IF EXISTS importe_rangos;
