-- Create a SECURITY DEFINER function to safely fetch personal calendar data by token/slug
CREATE OR REPLACE FUNCTION get_personal_calendar_public(p_token text)
RETURNS TABLE (
  id uuid,
  department_id uuid,
  worker_name text,
  worker_number text,
  max_days integer,
  slug text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.id,
    pc.department_id,
    pc.worker_name,
    pc.worker_number,
    pc.max_days,
    pc.slug
  FROM personal_calendars pc
  WHERE pc.public_token = p_token OR pc.slug = p_token;
END;
$$;

-- Grant execute to anon and authenticated users
GRANT EXECUTE ON FUNCTION get_personal_calendar_public(text) TO anon;
GRANT EXECUTE ON FUNCTION get_personal_calendar_public(text) TO authenticated;