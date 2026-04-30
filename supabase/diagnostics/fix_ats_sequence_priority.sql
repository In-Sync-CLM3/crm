-- =============================================================================
-- Fix "Ats - Initial Outbound" campaign showing as Active but with no Pipeline
-- and no Sent/Delivered counters in the Daily Report.
--
-- Root cause: mkt_campaigns.sequence_priority IS NULL for that campaign.
--
-- Three code paths gate on sequence_priority IS NOT NULL, so a NULL priority
-- looks exactly like the symptom (active badge, empty Pipeline column, every
-- S/D = "—"):
--
--   1. supabase/functions/mkt-outreach-executor/index.ts:41
--        .not('sequence_priority', 'is', null)
--      → Step-1 cold outreach is never executed for the campaign.
--
--   2. supabase/functions/mkt-sequence-executor/index.ts:36
--        .not('sequence_priority', 'is', null)
--      → Follow-up steps are never executed either. Function early-exits with
--        "No active campaigns with sequence_priority set".
--
--   3. supabase/migrations/20260425110000_mkt_step1_pipeline.sql:52
--        WHERE c.sequence_priority IS NOT NULL
--      → mkt_step1_pipeline RPC returns no row for the campaign, so the
--        DailyReport "Pipeline" column renders the em-dash fallback at
--        src/components/Marketing/DailyReport.tsx:303.
--
-- The "active" badge in the UI stays green regardless because it comes
-- straight from mkt_campaigns.status, which has no such gate.
--
-- USAGE:
--   1. Run STEP 1 (dry run). Confirm the Ats campaign exists, is active, and
--      has sequence_priority = NULL. Note the priorities already in use by
--      the other Initial Outbound campaigns so the new value doesn't collide.
--   2. Edit STEP 2 to set the priority you want (default below: max+1, which
--      puts Ats at the end of the sequence). Then COMMIT or ROLLBACK.
-- =============================================================================


-- =============================================================================
-- STEP 1 -- DRY RUN: confirm the diagnosis and show neighbouring priorities.
-- =============================================================================

-- 1a. The Ats campaign row.
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
WHERE c.name = 'Ats - Initial Outbound';

-- 1b. Priorities already in use, so the new value doesn't collide.
SELECT
  name,
  product_key,
  status,
  sequence_priority
FROM public.mkt_campaigns
WHERE sequence_priority IS NOT NULL
ORDER BY sequence_priority;


-- =============================================================================
-- STEP 2 -- APPLY: assign a sequence_priority to the Ats campaign.
--
-- Default: max(existing priority) + 1 — puts Ats at the end of the order.
-- Replace the subquery with a literal integer if you want a specific slot
-- (e.g. SET sequence_priority = 5).
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
WHERE name = 'Ats - Initial Outbound'
  AND sequence_priority IS NULL
RETURNING id, name, status, product_key, sequence_priority, updated_at;

-- Verify the resulting state before committing. Pipeline column should
-- start showing a row on the next 60-second auto-refresh of DailyReport.
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
WHERE c.name = 'Ats - Initial Outbound';

-- COMMIT;   -- uncomment to apply
-- ROLLBACK; -- uncomment to discard
