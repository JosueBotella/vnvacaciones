DROP VIEW IF EXISTS public.active_job_positions;
CREATE VIEW public.active_job_positions WITH (security_invoker = true) AS
  SELECT id, title, description FROM public.job_positions WHERE is_active = true;