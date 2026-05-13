-- Change default value of require_all_days to false
ALTER TABLE public.departments 
ALTER COLUMN require_all_days SET DEFAULT false;