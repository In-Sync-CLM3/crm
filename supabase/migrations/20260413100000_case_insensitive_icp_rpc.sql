-- Fix get_icp_native_contacts to use case-insensitive fuzzy matching.
--
-- Root problems with the old RPC:
--   1. Exact case-sensitive match — "Engineering Manager" ≠ "engineering manager"
--   2. company_sizes filter used abstract terms ("SMB","Mid-Market") that never
--      appear in the native dataset (which stores raw ranges like "1-50 EMP")
--   3. Industries used exact match — "Logistics" ≠ "Couriers / Logistics / Transportation"
--
-- Fix:
--   • Enable pg_trgm for GIN-backed ILIKE matching
--   • GIN indexes on designation + industry_type for fast substring search
--   • company_sizes parameter kept for API compat but ignored (no mapping exists)
--   • Designation: substring match in BOTH directions (handles "Senior Branch Manager")
--   • Industry: substring match in BOTH directions (handles compound industry strings)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP INDEX IF EXISTS idx_native_designation_trimmed;
DROP INDEX IF EXISTS idx_native_industry_trimmed;
DROP INDEX IF EXISTS idx_native_emp_size_trimmed;
DROP INDEX IF EXISTS idx_native_designation_lower;
DROP INDEX IF EXISTS idx_native_industry_lower;

CREATE INDEX IF NOT EXISTS idx_native_designation_trgm
  ON mkt_native_contacts USING gin (LOWER(designation) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_native_industry_trgm
  ON mkt_native_contacts USING gin (LOWER(industry_type) gin_trgm_ops);

-- Updated RPC: fuzzy case-insensitive, company_sizes ignored
CREATE OR REPLACE FUNCTION get_icp_native_contacts(
  p_industries    text[],
  p_designations  text[],
  p_company_sizes text[],   -- kept for API compatibility, ignored internally
  p_limit         int DEFAULT 2000
)
RETURNS SETOF mkt_native_contacts
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _d   text;
  _ind text;
  _des_pattern text := NULL;
  _ind_pattern text := NULL;
BEGIN
  -- Build OR pattern for designations
  IF p_designations IS NOT NULL AND array_length(p_designations, 1) > 0 THEN
    FOREACH _d IN ARRAY p_designations LOOP
      IF _des_pattern IS NULL THEN
        _des_pattern := LOWER(TRIM(_d));
      ELSE
        _des_pattern := _des_pattern || '|' || LOWER(TRIM(_d));
      END IF;
    END LOOP;
  END IF;

  -- Build OR pattern for industries
  IF p_industries IS NOT NULL AND array_length(p_industries, 1) > 0 THEN
    FOREACH _ind IN ARRAY p_industries LOOP
      IF _ind_pattern IS NULL THEN
        _ind_pattern := LOWER(TRIM(_ind));
      ELSE
        _ind_pattern := _ind_pattern || '|' || LOWER(TRIM(_ind));
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY
  SELECT *
  FROM mkt_native_contacts
  WHERE
    (
      _des_pattern IS NULL
      OR EXISTS (
        SELECT 1 FROM unnest(p_designations) AS d(val)
        WHERE LOWER(designation) ILIKE '%' || LOWER(TRIM(d.val)) || '%'
           OR LOWER(TRIM(d.val)) ILIKE '%' || LOWER(designation) || '%'
      )
    )
    AND (
      _ind_pattern IS NULL
      OR EXISTS (
        SELECT 1 FROM unnest(p_industries) AS i(val)
        WHERE LOWER(industry_type) ILIKE '%' || LOWER(TRIM(i.val)) || '%'
           OR LOWER(TRIM(i.val)) ILIKE '%' || LOWER(industry_type) || '%'
      )
    )
  LIMIT p_limit;
END;
$$;
