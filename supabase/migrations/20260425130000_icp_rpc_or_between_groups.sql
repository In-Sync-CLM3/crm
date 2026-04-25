-- Change get_icp_native_contacts: when both industries AND designations are
-- provided, use OR between them (match either) instead of AND (must match both).
-- AND was too restrictive — manufacturing contacts rarely have "Sales Manager"
-- titles in this dataset, leaving almost no AND matches.

CREATE OR REPLACE FUNCTION get_icp_native_contacts(
  p_industries    text[],
  p_designations  text[],
  p_company_sizes text[],
  p_limit         int  DEFAULT 500,
  p_offset        int  DEFAULT 0,
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
  v_exclude_small  boolean;
  v_small_patterns text[] := ARRAY['%1-10 %','%10-25 %','%25-50 %','%1-10e%','%10-25e%','%25-50e%'];
BEGIN
  SET LOCAL statement_timeout = '60000';

  v_no_desig := p_designations IS NULL OR array_length(p_designations, 1) IS NULL;
  v_no_indus := p_industries   IS NULL OR array_length(p_industries,   1) IS NULL;

  -- Exclude small companies when company_sizes explicitly omits SMB/Startup
  v_exclude_small := p_company_sizes IS NOT NULL
    AND array_length(p_company_sizes, 1) > 0
    AND NOT (p_company_sizes && ARRAY['SMB','Startup','smb','startup']);

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

  -- No filters → return all
  IF v_no_desig AND v_no_indus THEN
    RETURN QUERY
    SELECT c.id, c.full_name, c.phone, c.email_official, c.email_personal,
           c.email_generic, c.company_name, c.designation, c.industry_type,
           c.emp_size, c.city, c.state, c.country, c.linkedin_url
    FROM mkt_native_contacts c
    WHERE c.id > p_min_id
      AND (NOT v_exclude_small OR c.emp_size IS NULL OR NOT LOWER(c.emp_size) ILIKE ANY(v_small_patterns))
    ORDER BY c.id LIMIT p_limit;
    RETURN;
  END IF;

  -- Designation only
  IF v_no_indus THEN
    RETURN QUERY
    SELECT c.id, c.full_name, c.phone, c.email_official, c.email_personal,
           c.email_generic, c.company_name, c.designation, c.industry_type,
           c.emp_size, c.city, c.state, c.country, c.linkedin_url
    FROM mkt_native_contacts c
    WHERE c.id > p_min_id
      AND v_desig_patterns IS NOT NULL
      AND LOWER(c.designation) ILIKE ANY(v_desig_patterns)
      AND (NOT v_exclude_small OR c.emp_size IS NULL OR NOT LOWER(c.emp_size) ILIKE ANY(v_small_patterns))
    ORDER BY c.id LIMIT p_limit;
    RETURN;
  END IF;

  -- Industry only
  IF v_no_desig THEN
    RETURN QUERY
    SELECT c.id, c.full_name, c.phone, c.email_official, c.email_personal,
           c.email_generic, c.company_name, c.designation, c.industry_type,
           c.emp_size, c.city, c.state, c.country, c.linkedin_url
    FROM mkt_native_contacts c
    WHERE c.id > p_min_id
      AND v_indus_patterns IS NOT NULL
      AND LOWER(c.industry_type) ILIKE ANY(v_indus_patterns)
      AND (NOT v_exclude_small OR c.emp_size IS NULL OR NOT LOWER(c.emp_size) ILIKE ANY(v_small_patterns))
    ORDER BY c.id LIMIT p_limit;
    RETURN;
  END IF;

  -- Both provided → OR between groups (industry OR designation)
  RETURN QUERY
  SELECT c.id, c.full_name, c.phone, c.email_official, c.email_personal,
         c.email_generic, c.company_name, c.designation, c.industry_type,
         c.emp_size, c.city, c.state, c.country, c.linkedin_url
  FROM mkt_native_contacts c
  WHERE c.id > p_min_id
    AND (
      (v_indus_patterns IS NOT NULL AND LOWER(c.industry_type) ILIKE ANY(v_indus_patterns))
      OR
      (v_desig_patterns IS NOT NULL AND LOWER(c.designation)   ILIKE ANY(v_desig_patterns))
    )
    AND (NOT v_exclude_small OR c.emp_size IS NULL OR NOT LOWER(c.emp_size) ILIKE ANY(v_small_patterns))
  ORDER BY c.id LIMIT p_limit;
END;
$$;
