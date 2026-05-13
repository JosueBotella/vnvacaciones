-- Add work_group_id column to workers table for vacation group assignment
ALTER TABLE public.workers 
ADD COLUMN work_group_id uuid REFERENCES public.work_groups(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_workers_work_group_id ON public.workers(work_group_id);