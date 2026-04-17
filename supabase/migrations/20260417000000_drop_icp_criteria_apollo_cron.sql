-- SoT fix #5: mkt_product_icp is the single source of truth for ICP data.
-- Remove the redundant icp_criteria column from mkt_campaigns and the broken apollo-sourcer cron.

-- Drop stale icp_criteria column (was written by mkt-evolve-icp cascade; now unused)
ALTER TABLE public.mkt_campaigns DROP COLUMN IF EXISTS icp_criteria;

-- Remove broken apollo-sourcer cron job (Apollo API returns 401; function deleted)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('mkt-apollo-sourcer');
    RAISE NOTICE 'mkt-apollo-sourcer cron job removed';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not unschedule mkt-apollo-sourcer: %', SQLERRM;
END;
$$;
