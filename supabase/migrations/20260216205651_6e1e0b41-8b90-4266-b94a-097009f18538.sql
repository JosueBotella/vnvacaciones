ALTER TABLE public.incidencias_reglas_departamento
  ADD COLUMN umbral_graves_despido integer NOT NULL DEFAULT 3,
  ADD COLUMN umbral_muy_graves_despido integer NOT NULL DEFAULT 1,
  ADD COLUMN periodo_dias_despido integer NOT NULL DEFAULT 365,
  ADD COLUMN alerta_despido_activa boolean NOT NULL DEFAULT true;