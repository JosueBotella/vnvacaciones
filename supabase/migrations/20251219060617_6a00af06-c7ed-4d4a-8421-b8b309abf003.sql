-- Create table for manually unblocked days (admin overrides)
-- When a day is auto-blocked by concurrency, admin can temporarily unblock it
-- The day will auto-block again when another person takes it

CREATE TABLE public.department_day_overrides (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    is_unblocked BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by TEXT,
    UNIQUE(department_id, date)
);

-- Enable RLS
ALTER TABLE public.department_day_overrides ENABLE ROW LEVEL SECURITY;

-- Allow public read access for checking overrides in forms
CREATE POLICY "Anyone can read day overrides"
ON public.department_day_overrides
FOR SELECT USING (true);

-- Only authenticated admins can insert/update/delete (handled via edge function with service role)