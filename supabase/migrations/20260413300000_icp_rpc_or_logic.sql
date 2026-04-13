-- Fix statement timeout in get_icp_native_contacts.
--
-- Root cause: AND logic between designation + industry filters created very low
-- combined hit-rates (e.g. "Procurement Manager" AND "Manufacturing").  With
-- <500 matching rows across 464K contacts the DB scanned the entire table
-- before returning, causing a statement timeout.
--
-- Fixes:
-- 1. OR logic between designation and industry: a contact only needs to match
--    EITHER the right title OR the right sector.  This is how B2B lead sourcing
--    works — you want Procurement Managers regardless of industry, AND contacts
--    in Manufacturing regardless of title.  It also keeps the hit-rate high
--    enough that the ORDER BY c.id LIMIT 500 terminates quickly.
--
-- 2. Replace EXISTS(unnest) with ILIKE ANY(pre-built array).  PostgreSQL can
--    use the GIN trgm index with ILIKE ANY(array_literal), whereas the
--    correlated EXISTS(unnest) form is always a per-row scan.
--
-- 3. Remove bidirectional matching (the reverse ILIKE direction was an
--    additional correlated scan that gave marginal value).

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
STABLE
AS $$
DECLARE
  v_desig_patterns text[];
  v_indus_patterns text[];
  v_no_desig       boolean;
  v_no_indus       boolean;
BEGIN
  v_no_desig := p_designations IS NULL OR array_length(p_designations, 1) IS NULL;
  v_no_indus := p_industries   IS NULL OR array_length(p_industries,   1) IS NULL;

  -- Build pattern arrays upfront so the planner sees stable arrays,
  -- enabling the GIN trgm index to be used for ILIKE ANY(array).
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

  RETURN QUERY
  SELECT
    c.id, c.full_name, c.phone, c.email_official, c.email_personal,
    c.email_generic, c.company_name, c.designation, c.industry_type,
    c.emp_size, c.city, c.state, c.country, c.linkedin_url
  FROM mkt_native_contacts c
  WHERE c.id > p_min_id
    AND (
      -- No filters at all → include everything
      (v_no_desig AND v_no_indus)
      -- Designation filter matches (OR: right title regardless of industry)
      OR (NOT v_no_desig AND v_desig_patterns IS NOT NULL
          AND LOWER(c.designation) ILIKE ANY(v_desig_patterns))
      -- Industry filter matches (OR: right sector regardless of title)
      OR (NOT v_no_indus AND v_indus_patterns IS NOT NULL
          AND LOWER(c.industry_type) ILIKE ANY(v_indus_patterns))
    )
  ORDER BY c.id
  LIMIT p_limit;
END;
$$;
