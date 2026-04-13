-- Replace OFFSET-based pagination with cursor-based (WHERE id > p_min_id).
-- OFFSET forces the DB to skip N rows by scanning them all — too slow on 464K rows.
-- Cursor-based pagination uses the primary key btree index to seek directly to the
-- cursor position, then scans forward collecting matches — much faster.

CREATE OR REPLACE FUNCTION get_icp_native_contacts(
  p_industries    text[],
  p_designations  text[],
  p_company_sizes text[],        -- kept for API compat, ignored internally
  p_limit         int DEFAULT 500,
  p_offset        int DEFAULT 0,  -- kept for API compat, ignored internally
  p_min_id        uuid DEFAULT '00000000-0000-0000-0000-000000000000'
)
RETURNS TABLE (
  id              uuid,
  full_name       text,
  phone           text,
  email_official  text,
  email_personal  text,
  email_generic   text,
  company_name    text,
  designation     text,
  industry_type   text,
  emp_size        text,
  city            text,
  state           text,
  country         text,
  linkedin_url    text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.full_name, c.phone, c.email_official, c.email_personal,
    c.email_generic, c.company_name, c.designation, c.industry_type,
    c.emp_size, c.city, c.state, c.country, c.linkedin_url
  FROM mkt_native_contacts c
  WHERE c.id > p_min_id
    AND (
      p_designations IS NULL
      OR array_length(p_designations, 1) IS NULL
      OR EXISTS (
        SELECT 1 FROM unnest(p_designations) AS d(val)
        WHERE LOWER(c.designation) ILIKE '%' || LOWER(TRIM(d.val)) || '%'
           OR LOWER(TRIM(d.val)) ILIKE '%' || LOWER(c.designation) || '%'
      )
    )
    AND (
      p_industries IS NULL
      OR array_length(p_industries, 1) IS NULL
      OR EXISTS (
        SELECT 1 FROM unnest(p_industries) AS i(val)
        WHERE LOWER(c.industry_type) ILIKE '%' || LOWER(TRIM(i.val)) || '%'
           OR LOWER(TRIM(i.val)) ILIKE '%' || LOWER(c.industry_type) || '%'
      )
    )
  ORDER BY c.id
  LIMIT p_limit;
END;
$$;
