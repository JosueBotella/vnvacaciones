
-- 1) rrhh_users: deny direct client access; all access through edge functions (service_role bypasses RLS)
DROP POLICY IF EXISTS "Only admins can manage rrhh users" ON public.rrhh_users;
CREATE POLICY "Deny all client access to rrhh_users"
  ON public.rrhh_users
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- 2) job_positions: remove public anonymous SELECT that exposed internal criteria
DROP POLICY IF EXISTS "Anyone can view active job positions" ON public.job_positions;

-- Recreate the active_job_positions view to expose form_fields (UI config only) safely,
-- excluding the sensitive parts of criteria (custom_prompt, AI scoring rules, etc.)
DROP VIEW IF EXISTS public.active_job_positions;
CREATE VIEW public.active_job_positions
WITH (security_invoker = true)
AS
SELECT
  id,
  title,
  description,
  COALESCE(criteria->'form_fields', '{}'::jsonb) AS form_fields
FROM public.job_positions
WHERE is_active = true;

GRANT SELECT ON public.active_job_positions TO anon, authenticated;

-- Allow public to read only the safe view (RLS still applies to the underlying table for invoker,
-- so we add a narrow SELECT policy that returns ONLY when accessed through queries that don't
-- expose the sensitive criteria column directly. Simpler: re-add a public SELECT on the base table
-- but the client code will be migrated to use the view; keep base table admin-only.)
-- Since security_invoker = true, the view requires a SELECT policy on job_positions for anon.
-- We add a minimal policy that grants SELECT to anon only when reading via the view path.
-- Postgres has no per-column RLS, so we accept that the policy permits SELECT on active rows
-- but rely on column-level GRANTs to hide the criteria column from public roles.
CREATE POLICY "Public can view active job positions (safe columns only)"
  ON public.job_positions
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Revoke column-level access so anon/authenticated cannot SELECT sensitive columns directly
REVOKE SELECT ON public.job_positions FROM anon, authenticated;
GRANT SELECT (id, title, description, is_active, department_id, created_at, updated_at)
  ON public.job_positions TO anon, authenticated;
-- Note: 'criteria' and 'created_by' are intentionally omitted from the grant.

-- 3) incidencias_losses: add explicit deny policy for clarity (defense-in-depth)
CREATE POLICY "Deny direct client access to incidencias_losses"
  ON public.incidencias_losses
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
