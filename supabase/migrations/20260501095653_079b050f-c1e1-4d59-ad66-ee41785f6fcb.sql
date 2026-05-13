DELETE FROM public.worker_team_labels WHERE name='TestSacado';

-- Add inherit_team_color column for "use parent group color" toggle
ALTER TABLE public.worker_team_labels 
ADD COLUMN IF NOT EXISTS inherit_team_color boolean NOT NULL DEFAULT false;