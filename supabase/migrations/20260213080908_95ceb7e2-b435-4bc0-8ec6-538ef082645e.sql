
ALTER TABLE public.incidencias_records
  ADD COLUMN accion_propuesta text NOT NULL DEFAULT 'solo_incidencia',
  ADD COLUMN propuesta_suspension boolean NOT NULL DEFAULT false,
  ADD COLUMN propuesta_fecha_inicio date;
