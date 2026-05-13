-- Add max concurrent workers per group
ALTER TABLE public.work_groups 
ADD COLUMN max_concurrent_workers integer DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.work_groups.max_concurrent_workers IS 'Maximum number of workers from this group that can have approved vacation on the same day';

-- Add global max concurrent workers to departments (applies across all groups)
ALTER TABLE public.departments 
ADD COLUMN max_concurrent_workers_global integer DEFAULT NULL;

COMMENT ON COLUMN public.departments.max_concurrent_workers_global IS 'Maximum number of workers across all groups that can have approved vacation on the same day';