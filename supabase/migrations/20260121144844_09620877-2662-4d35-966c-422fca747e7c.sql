-- =====================================================
-- FIX: Remove overly permissive RLS policies
-- All data access goes through Edge Functions with service_role
-- so we can safely restrict direct table access
-- =====================================================

-- 1. FIX: backup_history - Remove the problematic "Service role can manage backups" policy with USING (true)
DROP POLICY IF EXISTS "Service role can manage backups" ON public.backup_history;

-- 2. FIX: manager_department_assignments - The SELECT with USING (true) is too permissive
DROP POLICY IF EXISTS "Only authenticated users can view assignments" ON public.manager_department_assignments;
CREATE POLICY "Only admins can view assignments" ON public.manager_department_assignments
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. FIX: labor_incident_alerts - SELECT with USING (true) is too permissive
DROP POLICY IF EXISTS "Admins can view all alerts" ON public.labor_incident_alerts;
CREATE POLICY "Only admins can view labor alerts" ON public.labor_incident_alerts
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. FIX: justificante_documentos - SELECT with USING (true) is too permissive  
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON public.justificante_documentos;
CREATE POLICY "Only admins can view justificante documents" ON public.justificante_documentos
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Note: The following tables with SELECT USING (true) are INTENTIONALLY public 
-- as they contain non-sensitive calendar/scheduling data needed for the public vacation form:
-- - work_groups (group names/colors for calendar display)
-- - worker_teams (team names for calendar display)
-- - work_group_teams (team-group associations)
-- - annual_calendars (year/department info)
-- - annual_calendar_days (calendar day data)
-- - custom_day_types (day type names/colors)
-- - department_availabilities (available dates for vacation requests)
-- - department_day_overrides (day override info)
-- - department_shifts (shift info for schedules)
-- - department_role_aliases (role display names)
-- - personal_calendar_availabilities (calendar availability)
-- - worker_day_exceptions (exception day info)
-- - app_settings (global config, no sensitive data)
-- 
-- Sensitive fields (emails, passwords, etc.) are in separate tables with proper RLS
-- All sensitive data access routes through edge functions with service_role