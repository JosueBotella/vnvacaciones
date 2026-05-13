
-- Add day-of-week distribution and peak day to department stats
ALTER TABLE public.incidencias_department_stats 
ADD COLUMN IF NOT EXISTS day_distribution jsonb DEFAULT '[0,0,0,0,0,0,0]'::jsonb,
ADD COLUMN IF NOT EXISTS dia_pico smallint DEFAULT 0,
ADD COLUMN IF NOT EXISTS tendencia text DEFAULT 'estable';
