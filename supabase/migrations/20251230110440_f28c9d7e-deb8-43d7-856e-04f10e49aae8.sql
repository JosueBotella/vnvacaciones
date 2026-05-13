-- Add soft delete fields to workers table
ALTER TABLE public.workers 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

-- Create index for efficient querying of active/deleted workers
CREATE INDEX IF NOT EXISTS idx_workers_deleted_at ON public.workers(deleted_at);

-- Add comment explaining the soft delete pattern
COMMENT ON COLUMN public.workers.deleted_at IS 'Timestamp when worker was soft-deleted. NULL means active.';
COMMENT ON COLUMN public.workers.deleted_by IS 'Name of admin who deleted the worker';
COMMENT ON COLUMN public.workers.deletion_reason IS 'Reason for deletion (e.g., "No aparece en CSV", "Baja voluntaria")';