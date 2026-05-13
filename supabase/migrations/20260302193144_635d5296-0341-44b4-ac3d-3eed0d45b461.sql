ALTER TABLE team_config_drafts 
ADD COLUMN change_log jsonb DEFAULT '[]'::jsonb;