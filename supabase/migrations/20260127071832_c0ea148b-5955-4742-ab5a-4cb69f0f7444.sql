-- Add is_schedule_locked column to worker_teams for team schedule locking
-- When locked, the team's schedule will never be changed by automatic rotations
-- and manual changes will propagate to all future weeks

ALTER TABLE public.worker_teams 
ADD COLUMN IF NOT EXISTS is_schedule_locked boolean NOT NULL DEFAULT false;

-- Add index for quick lookup
CREATE INDEX IF NOT EXISTS idx_worker_teams_is_schedule_locked 
ON public.worker_teams(is_schedule_locked) WHERE is_schedule_locked = true;

COMMENT ON COLUMN public.worker_teams.is_schedule_locked IS 'When true, this team will keep its assigned schedule and not be affected by rotations';

-- Add updated_at trigger for worker_teams if not exists
DROP TRIGGER IF EXISTS update_worker_teams_updated_at ON public.worker_teams;
CREATE TRIGGER update_worker_teams_updated_at
BEFORE UPDATE ON public.worker_teams
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();