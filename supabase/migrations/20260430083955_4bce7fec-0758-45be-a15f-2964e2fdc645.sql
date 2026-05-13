-- Allow anonymous public access to active job positions through the safe view.
-- The view only exposes id, title, description and form_fields (UI config).
-- Sensitive criteria (custom_prompt, AI scoring, distance limits) stay private.
ALTER VIEW public.active_job_positions SET (security_invoker = off);
GRANT SELECT ON public.active_job_positions TO anon, authenticated;