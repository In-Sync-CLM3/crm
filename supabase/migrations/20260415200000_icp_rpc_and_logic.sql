-- Switch get_icp_native_contacts from OR/UNION to AND logic when both filters
-- are present. OR (UNION) was intended to maximise reach but causes timeouts
-- when an ICP has broad industries (Technology, Retail, Healthcare, ...) because
-- almost every row in the 464K dataset matches at least one industry pattern.
--
-- AND semantics ("Event Manager who works in Technology/Events") are also the
-- correct business intent: the ICP defines target *roles within target industries*,
-- not anyone in those industries plus anyone with those roles.
--
-- When only one filter is non-empty the query falls back to a single-column scan
-- (same as before).

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

  -- Both filters empty → return all contacts after cursor
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

  -- Only designations → designation index scan only
  IF v_no_indus THEN
    RETURN QUERY
    SELECT c.id, c.full_name, c.phone, c.email_official, c.email_personal,
           c.email_generic, c.company_name, c.designation, c.industry_type,
           c.emp_size, c.city, c.state, c.country, c.linkedin_url
    FROM mkt_native_contacts c
    WHERE c.id > p_min_id
      AND v_desig_patterns IS NOT NULL
      AND LOWER(c.designation) ILIKE ANY(v_desig_patterns)
    ORDER BY c.id
    LIMIT p_limit;
    RETURN;
  END IF;

  -- Only industries → industry index scan only
  IF v_no_desig THEN
    RETURN QUERY
    SELECT c.id, c.full_name, c.phone, c.email_official, c.email_personal,
           c.email_generic, c.company_name, c.designation, c.industry_type,
           c.emp_size, c.city, c.state, c.country, c.linkedin_url
    FROM mkt_native_contacts c
    WHERE c.id > p_min_id
      AND v_indus_patterns IS NOT NULL
      AND LOWER(c.industry_type) ILIKE ANY(v_indus_patterns)
    ORDER BY c.id
    LIMIT p_limit;
    RETURN;
  END IF;

  -- Both filters present → AND logic: must match both industry AND designation.
  -- This is the correct business intent (target roles within target industries)
  -- and is dramatically faster than UNION when industries are broad terms like
  -- "Technology" or "Retail" that match most of the dataset.
  --
  -- PostgreSQL will use the more selective trigram index (typically designation)
  -- first, then filter by industry — result set stays small and fast.
  RETURN QUERY
  SELECT c.id, c.full_name, c.phone, c.email_official, c.email_personal,
         c.email_generic, c.company_name, c.designation, c.industry_type,
         c.emp_size, c.city, c.state, c.country, c.linkedin_url
  FROM mkt_native_contacts c
  WHERE c.id > p_min_id
    AND v_indus_patterns IS NOT NULL
    AND v_desig_patterns IS NOT NULL
    AND LOWER(c.industry_type) ILIKE ANY(v_indus_patterns)
    AND LOWER(c.designation)   ILIKE ANY(v_desig_patterns)
  ORDER BY c.id
  LIMIT p_limit;
END;
$$;
