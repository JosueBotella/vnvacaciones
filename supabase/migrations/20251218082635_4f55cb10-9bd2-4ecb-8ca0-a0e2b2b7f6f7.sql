-- Add max_free_days column to work_groups table
-- This will store the calculated free configuration days per group (26.5 - vacation_days)
ALTER TABLE public.work_groups 
ADD COLUMN max_free_days numeric DEFAULT 26.5;

-- Add comment explaining the field
COMMENT ON COLUMN public.work_groups.max_free_days IS 'Días de libre configuración disponibles para trabajadores de este grupo. Calculado como 26.5 - días de vacaciones del grupo en el calendario anual.';