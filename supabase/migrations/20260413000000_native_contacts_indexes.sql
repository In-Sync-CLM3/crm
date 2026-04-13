-- Functional indexes on mkt_native_contacts to speed up ICP-filtered queries.
-- TRIM(column) = ANY(array) can use these indexes, converting the full seq-scan
-- on 464K rows to fast index lookups.

CREATE INDEX IF NOT EXISTS idx_native_designation_trimmed
  ON mkt_native_contacts (TRIM(designation));

CREATE INDEX IF NOT EXISTS idx_native_industry_trimmed
  ON mkt_native_contacts (TRIM(industry_type));

CREATE INDEX IF NOT EXISTS idx_native_emp_size_trimmed
  ON mkt_native_contacts (TRIM(emp_size));

-- Re-create RPC to wire in company_size filtering (was accepted but never applied)
-- and ensure the planner sees the expressions matching the new functional indexes.
CREATE OR REPLACE FUNCTION get_icp_native_contacts(
  p_industries    text[],
  p_designations  text[],
  p_company_sizes text[],
  p_limit         int DEFAULT 2000
)
RETURNS SETOF mkt_native_contacts
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM mkt_native_contacts
  WHERE
    (
      p_designations IS NULL
      OR array_length(p_designations, 1) IS NULL
      OR TRIM(designation) = ANY(p_designations)
    )
    AND (
      p_industries IS NULL
      OR array_length(p_industries, 1) IS NULL
      OR TRIM(industry_type) = ANY(p_industries)
    )
    AND (
      p_company_sizes IS NULL
      OR array_length(p_company_sizes, 1) IS NULL
      OR TRIM(emp_size) = ANY(p_company_sizes)
    )
  LIMIT p_limit;
$$;
