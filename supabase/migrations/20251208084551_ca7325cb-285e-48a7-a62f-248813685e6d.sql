-- Fix: Set SECURITY INVOKER on departments_public view
-- to use querying user's permissions instead of view creator's
ALTER VIEW public.departments_public SET (security_invoker = on);