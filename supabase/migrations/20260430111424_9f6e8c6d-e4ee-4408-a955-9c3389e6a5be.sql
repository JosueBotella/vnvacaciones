-- Seed: mark "Mozo/a almacén" (or similar) as the default position if no default is set yet
DO $$
DECLARE
  has_default boolean;
  mozo_id uuid;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.job_positions WHERE is_default = true) INTO has_default;
  IF NOT has_default THEN
    SELECT id INTO mozo_id
    FROM public.job_positions
    WHERE is_active = true
      AND title ~* 'mozo.*almac[eé]n'
    ORDER BY created_at ASC
    LIMIT 1;

    IF mozo_id IS NOT NULL THEN
      UPDATE public.job_positions SET is_default = true WHERE id = mozo_id;
    END IF;
  END IF;
END $$;