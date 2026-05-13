
-- =============================================
-- RLS PERFORMANCE OPTIMIZATION - INDEX MIGRATION
-- =============================================
-- Add indexes to optimize RLS policy evaluations

-- =============================================
-- 1. USER_ROLES - Critical for has_role() function
-- =============================================
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id 
  ON public.user_roles(user_id);

-- =============================================
-- 2. SYSTEM_USER_ROLES - For has_system_role() function
-- =============================================
CREATE INDEX IF NOT EXISTS idx_system_user_roles_user_identifier 
  ON public.system_user_roles(user_identifier);

CREATE INDEX IF NOT EXISTS idx_system_user_roles_user_type 
  ON public.system_user_roles(user_type);

-- =============================================
-- 3. MANAGERS - Add department_id index for filtering
-- =============================================
CREATE INDEX IF NOT EXISTS idx_managers_department_id 
  ON public.managers(department_id);

CREATE INDEX IF NOT EXISTS idx_managers_role 
  ON public.managers(role);

-- =============================================
-- 4. WORKERS - Add department_id index (commonly filtered)
-- =============================================
CREATE INDEX IF NOT EXISTS idx_workers_department_id 
  ON public.workers(department_id);

CREATE INDEX IF NOT EXISTS idx_workers_worker_team_id 
  ON public.workers(worker_team_id);

-- =============================================
-- 5. VACATION_REQUESTS - Optimize common queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_vacation_requests_department_id 
  ON public.vacation_requests(department_id);

CREATE INDEX IF NOT EXISTS idx_vacation_requests_status 
  ON public.vacation_requests(status);

CREATE INDEX IF NOT EXISTS idx_vacation_requests_created_at 
  ON public.vacation_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vacation_requests_worker_number 
  ON public.vacation_requests(worker_number);

-- =============================================
-- 6. JUSTIFICANTES - Optimize RLS and common queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_justificantes_worker_id 
  ON public.justificantes(worker_id);

CREATE INDEX IF NOT EXISTS idx_justificantes_department_id 
  ON public.justificantes(department_id);

CREATE INDEX IF NOT EXISTS idx_justificantes_estado 
  ON public.justificantes(estado);

-- =============================================
-- 7. TIME_ENTRIES - Optimize labor module queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_time_entries_worker_id 
  ON public.time_entries(worker_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_entry_date 
  ON public.time_entries(entry_date);

CREATE INDEX IF NOT EXISTS idx_time_entries_is_absence 
  ON public.time_entries(is_absence) WHERE is_absence = true;

-- =============================================
-- 8. PSICO_SESSIONS - Optimize test session queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_psico_sessions_test_id 
  ON public.psico_sessions(test_id);

CREATE INDEX IF NOT EXISTS idx_psico_sessions_status 
  ON public.psico_sessions(status);

CREATE INDEX IF NOT EXISTS idx_psico_sessions_started_at 
  ON public.psico_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_psico_sessions_access_code 
  ON public.psico_sessions(access_code);

-- =============================================
-- 9. PERSONAL_CALENDARS - Optimize public token lookups
-- =============================================
CREATE INDEX IF NOT EXISTS idx_personal_calendars_public_token 
  ON public.personal_calendars(public_token);

CREATE INDEX IF NOT EXISTS idx_personal_calendars_slug 
  ON public.personal_calendars(slug);

CREATE INDEX IF NOT EXISTS idx_personal_calendars_department_id 
  ON public.personal_calendars(department_id);

-- =============================================
-- 10. DEPARTMENTS - Optimize slug/token lookups
-- =============================================
CREATE INDEX IF NOT EXISTS idx_departments_slug 
  ON public.departments(slug);

CREATE INDEX IF NOT EXISTS idx_departments_public_token 
  ON public.departments(public_token);

-- =============================================
-- 11. SECURITY_EVENTS - Optimize audit queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_security_events_event_type 
  ON public.security_events(event_type);

CREATE INDEX IF NOT EXISTS idx_security_events_created_at 
  ON public.security_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_actor_id 
  ON public.security_events(actor_id);

-- =============================================
-- 12. HOUR_BALANCES - Balance module optimization
-- =============================================
CREATE INDEX IF NOT EXISTS idx_hour_balances_worker_id 
  ON public.hour_balances(worker_id);

-- =============================================
-- 13. WORK_GROUPS - Group management
-- =============================================
CREATE INDEX IF NOT EXISTS idx_work_groups_department_id 
  ON public.work_groups(department_id);

-- =============================================
-- 14. WORKER_TEAMS - Team management
-- =============================================
CREATE INDEX IF NOT EXISTS idx_worker_teams_department_id 
  ON public.worker_teams(department_id);

-- =============================================
-- 15. PSICO_ANSWERS - Test answer queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_psico_answers_session_id 
  ON public.psico_answers(session_id);

-- =============================================
-- 16. PSICO_RESULTS - Test result queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_psico_results_session_id 
  ON public.psico_results(session_id);

-- =============================================
-- 17. WORKER_CALENDAR_MODIFICATIONS
-- =============================================
CREATE INDEX IF NOT EXISTS idx_worker_calendar_mods_worker_id 
  ON public.worker_calendar_modifications(worker_id);

CREATE INDEX IF NOT EXISTS idx_worker_calendar_mods_department_id 
  ON public.worker_calendar_modifications(department_id);

-- =============================================
-- 18. WORKER_COMMENTS
-- =============================================
CREATE INDEX IF NOT EXISTS idx_worker_comments_worker_id 
  ON public.worker_comments(worker_id);

-- =============================================
-- 19. LOGIN_ATTEMPTS - Optimize cleanup queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at 
  ON public.login_attempts(attempted_at DESC);

-- =============================================
-- 20. MANAGER_DEPARTMENT_ASSIGNMENTS
-- =============================================
CREATE INDEX IF NOT EXISTS idx_manager_dept_assign_manager_id 
  ON public.manager_department_assignments(manager_id);

CREATE INDEX IF NOT EXISTS idx_manager_dept_assign_department_id 
  ON public.manager_department_assignments(department_id);

-- =============================================
-- 21. ANNUAL_CALENDAR_DAYS - Calendar queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_annual_calendar_days_calendar_id 
  ON public.annual_calendar_days(calendar_id);

CREATE INDEX IF NOT EXISTS idx_annual_calendar_days_date 
  ON public.annual_calendar_days(date);

-- =============================================
-- 22. ANNUAL_CALENDARS - Calendar queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_annual_calendars_department_id 
  ON public.annual_calendars(department_id);

CREATE INDEX IF NOT EXISTS idx_annual_calendars_year 
  ON public.annual_calendars(year);

-- =============================================
-- 23. AUDIT_LOGS - Add more indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_name 
  ON public.audit_logs(actor_name);
