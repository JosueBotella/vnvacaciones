-- Add system_type column to track which built-in type a custom_day_type represents
-- If null, it's a custom category; if 'festivo' or 'vacaciones_generales', it's a color override for that built-in type
ALTER TABLE public.custom_day_types
ADD COLUMN system_type TEXT DEFAULT NULL;

-- Add unique constraint to prevent duplicate system type overrides per department
CREATE UNIQUE INDEX idx_custom_day_types_system_type 
ON public.custom_day_types(department_id, system_type) 
WHERE system_type IS NOT NULL;