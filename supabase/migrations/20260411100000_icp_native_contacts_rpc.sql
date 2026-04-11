-- RPC for ICP-filtered native contact sourcing.
-- Uses TRIM() at query time so dirty whitespace in the dataset doesn't break matching.
-- Empty arrays mean "no filter" (return all).

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
  LIMIT p_limit;
$$;
