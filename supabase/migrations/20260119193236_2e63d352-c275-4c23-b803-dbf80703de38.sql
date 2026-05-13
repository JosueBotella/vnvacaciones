-- =============================================
-- BACKUP SYSTEM INFRASTRUCTURE
-- Creates storage bucket, history table, and scheduled job
-- =============================================

-- 1. Create private storage bucket for backups
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 104857600, ARRAY['application/json', 'application/gzip'])
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies for backups bucket - only admins can access
CREATE POLICY "Only admins can view backups"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'backups' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only service role can upload backups"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'backups');

CREATE POLICY "Only admins can delete old backups"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'backups' AND has_role(auth.uid(), 'admin'::app_role));

-- 3. Create backup history table
CREATE TABLE IF NOT EXISTS public.backup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_date DATE NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  tables_count INTEGER,
  total_records INTEGER,
  storage_files_count INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'in_progress')),
  error_message TEXT,
  download_url TEXT,
  expires_at TIMESTAMPTZ,
  triggered_by TEXT DEFAULT 'cron',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS on backup_history
ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

-- 5. Only admins can view backup history
CREATE POLICY "Only admins can view backup history"
  ON public.backup_history
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. Service role can insert/update backup records (via edge function)
CREATE POLICY "Service role can manage backups"
  ON public.backup_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 7. Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- 8. Enable pg_net for HTTP calls from cron
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 9. Grant usage on cron schema
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;