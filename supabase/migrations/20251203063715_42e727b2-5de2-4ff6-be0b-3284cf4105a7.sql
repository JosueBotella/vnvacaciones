-- Grant permissions to anon and authenticated roles for vacation_requests
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacation_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacation_requests TO authenticated;

-- Grant permissions for vacation_request_dates
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacation_request_dates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacation_request_dates TO authenticated;

-- Grant permissions for departments (read for public forms)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;

-- Grant permissions for department_availabilities
GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_availabilities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_availabilities TO authenticated;

-- Grant permissions for managers
GRANT SELECT, INSERT, UPDATE, DELETE ON public.managers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.managers TO authenticated;