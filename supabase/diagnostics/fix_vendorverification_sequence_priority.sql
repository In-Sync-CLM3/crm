-- =============================================================================
-- IMMEDIATE FIX: Vendorverification - Initial Outbound stuck at 0/100
--
-- Same root cause as yesterday's Ats fix (b60a2ba): NULL sequence_priority
-- on mkt_campaigns silently disables sending while keeping the badge "active".
--
-- Run STEP 1 to confirm. If sequence_priority is NULL, run STEP 2.
--
-- For the PERMANENT fix (DB trigger + backfill that prevents this from ever
-- recurring), apply migration 20260501100000_mkt_campaigns_autoassign_priority.sql
-- — that backfills Vendorverification automatically and removes the need
-- for any future one-off fixes like this one.
-- =============================================================================


-- =============================================================================
-- STEP 1 -- DRY RUN
-- =============================================================================

SELECT
  c.id                AS campaign_id,
  c.org_id,
  c.name              AS campaign_name,
  c.status            AS campaign_status,
  c.product_key,
  c.sequence_priority,
  p.id                AS product_id,
  p.product_name,
  p.active            AS product_active,
  (
    SELECT count(*) FROM public.mkt_campaign_steps cs
    WHERE cs.campaign_id = c.id AND cs.step_number = 1 AND cs.is_active = true
  )                   AS active_step1_count,
  (
    SELECT count(*) FROM public.mkt_sequence_enrollments e
    WHERE e.campaign_id = c.id AND e.status = 'active'
  )                   AS active_enrollments
FROM public.mkt_campaigns c
LEFT JOIN public.mkt_products p
  ON p.org_id = c.org_id AND p.product_key = c.product_key
WHERE c.name = 'Vendorverification - Initial Outbound';

-- Priorities already in use, so the new value doesn't collide.
SELECT name, product_key, status, sequence_priority
FROM public.mkt_campaigns
WHERE sequence_priority IS NOT NULL
ORDER BY sequence_priority;


-- =============================================================================
-- STEP 2 -- APPLY: assign max+1 priority (puts Vendor at the end of order).
-- =============================================================================
BEGIN;

UPDATE public.mkt_campaigns
SET
  sequence_priority = (
    SELECT COALESCE(MAX(sequence_priority), 0) + 1
    FROM public.mkt_campaigns
    WHERE sequence_priority IS NOT NULL
  ),
  updated_at = now()
WHERE name = 'Vendorverification - Initial Outbound'
  AND sequence_priority IS NULL
RETURNING id, name, status, product_key, sequence_priority, updated_at;

SELECT
  c.name              AS campaign_name,
  c.status            AS campaign_status,
  c.sequence_priority,
  (
    SELECT count(*) FROM public.mkt_campaign_steps cs
    WHERE cs.campaign_id = c.id AND cs.step_number = 1 AND cs.is_active = true
  )                   AS active_step1_count,
  (
    SELECT count(*) FROM public.mkt_sequence_enrollments e
    WHERE e.campaign_id = c.id AND e.status = 'active' AND e.current_step = 1
  )                   AS step1_queued
FROM public.mkt_campaigns c
WHERE c.name = 'Vendorverification - Initial Outbound';

-- COMMIT;   -- uncomment to apply
-- ROLLBACK; -- uncomment to discard
