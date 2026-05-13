-- Enable REPLICA IDENTITY FULL for realtime updates
ALTER TABLE public.annual_calendar_days REPLICA IDENTITY FULL;
ALTER TABLE public.work_groups REPLICA IDENTITY FULL;
ALTER TABLE public.custom_day_types REPLICA IDENTITY FULL;
ALTER TABLE public.work_group_teams REPLICA IDENTITY FULL;
ALTER TABLE public.worker_teams REPLICA IDENTITY FULL;

-- Add tables to supabase_realtime publication for real-time updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.annual_calendar_days;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_day_types;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_group_teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_teams;