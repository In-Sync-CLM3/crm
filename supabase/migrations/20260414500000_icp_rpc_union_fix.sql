-- Fix get_icp_native_contacts: rewrite OR logic as UNION so GIN trigram indexes
-- are used independently on each column (OR prevents the planner from using them).
-- Also bumps statement_timeout to 60s for safety.

CREATE OR REPLACE FUNCTION get_icp_native_contacts(
  p_industries    text[],
  p_designations  text[],
  p_company_sizes text[],        -- kept for API compat, ignored internally
  p_limit         int  DEFAULT 500,
  p_offset        int  DEFAULT 0,   -- kept for API compat, ignored internally
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
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  v_desig_patterns text[];
  v_indus_patterns text[];
  v_no_desig       boolean;
  v_no_indus       boolean;
BEGIN
  -- Allow up to 60 seconds for this query.
  SET LOCAL statement_timeout = '60000';

  v_no_desig := p_designations IS NULL OR array_length(p_designations, 1) IS NULL;
  v_no_indus := p_industries   IS NULL OR array_length(p_industries,   1) IS NULL;

  IF NOT v_no_desig THEN
    SELECT ARRAY_AGG('%' || LOWER(TRIM(x)) || '%')
    INTO v_desig_patterns
    FROM unnest(p_designations) x
    WHERE TRIM(x) <> '';
  END IF;

  IF NOT v_no_indus THEN
    SELECT ARRAY_AGG('%' || LOWER(TRIM(x)) || '%')
    INTO v_indus_patterns
    FROM unnest(p_industries) x
    WHERE TRIM(x) <> '';
  END IF;

  -- If both filters are empty, return all contacts starting after min_id
  IF v_no_desig AND v_no_indus THEN
    RETURN QUERY
    SELECT c.id, c.full_name, c.phone, c.email_official, c.email_personal,
           c.email_generic, c.company_name, c.designation, c.industry_type,
           c.emp_size, c.city, c.state, c.country, c.linkedin_url
    FROM mkt_native_contacts c
    WHERE c.id > p_min_id
    ORDER BY c.id
    LIMIT p_limit;
    RETURN;
  END IF;

  -- UNION approach: each branch targets a single indexed column so the GIN
  -- trigram index can be used independently (OR between two ILIKE ANY expressions
  -- forces a sequential scan on 464K rows).
  RETURN QUERY
  SELECT DISTINCT ON (c.id)
    c.id, c.full_name, c.phone, c.email_official, c.email_personal,
    c.email_generic, c.company_name, c.designation, c.industry_type,
    c.emp_size, c.city, c.state, c.country, c.linkedin_url
  FROM (
    -- Branch 1: industry match (uses idx_native_industry_trgm)
    SELECT nc.id
    FROM mkt_native_contacts nc
    WHERE nc.id > p_min_id
      AND NOT v_no_indus
      AND v_indus_patterns IS NOT NULL
      AND LOWER(nc.industry_type) ILIKE ANY(v_indus_patterns)

    UNION

    -- Branch 2: designation match (uses idx_native_designation_trgm)
    SELECT nc.id
    FROM mkt_native_contacts nc
    WHERE nc.id > p_min_id
      AND NOT v_no_desig
      AND v_desig_patterns IS NOT NULL
      AND LOWER(nc.designation) ILIKE ANY(v_desig_patterns)
  ) matched
  JOIN mkt_native_contacts c ON c.id = matched.id
  ORDER BY c.id
  LIMIT p_limit;
END;
$$;
