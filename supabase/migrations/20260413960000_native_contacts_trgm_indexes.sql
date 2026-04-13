-- GIN trigram indexes on mkt_native_contacts for fast ILIKE pattern matching.
-- Required for get_icp_native_contacts to stay within statement timeout on 464K rows.
-- pg_trgm enables GIN indexes to accelerate ILIKE/LIKE with wildcard patterns.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- These are built CONCURRENTLY so they don't lock reads/writes during index build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_native_designation_trgm
  ON mkt_native_contacts USING GIN (LOWER(designation) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_native_industry_trgm
  ON mkt_native_contacts USING GIN (LOWER(industry_type) gin_trgm_ops);
