-- 1) department_day_overrides: restrict SELECT to authenticated users only
DROP POLICY IF EXISTS "Anyone can read day overrides" ON public.department_day_overrides;
CREATE POLICY "Authenticated users can read day overrides"
  ON public.department_day_overrides
  FOR SELECT
  TO authenticated
  USING (true);

-- 2) rrhh_users: remove redundant SELECT policy (FOR ALL already covers it)
DROP POLICY IF EXISTS "Only admins can view rrhh users" ON public.rrhh_users;

-- 3) storage.objects: prevent anonymous LIST/SELECT enumeration on public buckets.
-- Public file URLs continue to work because the storage REST endpoint serves
-- public buckets without going through RLS.
DROP POLICY IF EXISTS "Public can read assets" ON storage.objects;
CREATE POLICY "Authenticated can read assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'assets');

DROP POLICY IF EXISTS "Manager avatars are publicly readable" ON storage.objects;
CREATE POLICY "Authenticated can read manager avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'manager-avatars');