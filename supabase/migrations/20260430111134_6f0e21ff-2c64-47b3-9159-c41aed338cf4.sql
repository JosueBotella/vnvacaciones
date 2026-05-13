-- Add is_default column to job_positions
ALTER TABLE public.job_positions
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Ensure at most one default position globally (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS job_positions_only_one_default
  ON public.job_positions ((is_default))
  WHERE is_default = true;

-- Recreate the public view to include is_default
DROP VIEW IF EXISTS public.active_job_positions;
CREATE VIEW public.active_job_positions AS
SELECT
  id,
  title,
  description,
  COALESCE(criteria -> 'form_fields', '{}'::jsonb) AS form_fields,
  is_default
FROM public.job_positions
WHERE is_active = true;

GRANT SELECT ON public.active_job_positions TO anon, authenticated;