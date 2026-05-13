INSERT INTO public.incidencias_gravedades (key, label, label_plural, color, puntos, icon_name, sort_order, active)
VALUES ('depende', 'Depende', 'Depende', '#6b7280', 0, 'HelpCircle', 99, true)
ON CONFLICT DO NOTHING;