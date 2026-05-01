-- =============================================================================
-- PERMANENT FIX: stop campaigns from getting stuck at 0/100 with NULL priority.
--
-- Recurring bug history:
--   2026-04-29 047fb57 — three Initial Outbound campaigns paused
--   2026-04-30 b60a2ba — Ats - Initial Outbound: NULL sequence_priority
--   2026-05-01           — Vendorverification - Initial Outbound: same
--
-- Symptom: status badge "active", but Pipeline column shows 0/100 and the
-- daily report S/D counters stay at "—" all day. Cause: four code paths gate
-- on `sequence_priority IS NOT NULL` and silently skip NULL rows:
--   1. mkt-outreach-executor    — step 1 cold outreach skipped
--   2. mkt-sequence-executor    — follow-ups skipped
--   3. mkt_step1_pipeline RPC   — Pipeline column blank
--   4. useArohanContext         — Arohan AI doesn't see the campaign
--
-- This migration applies a three-layer permanent fix:
--   A. BEFORE INSERT/UPDATE trigger that auto-assigns sequence_priority =
--      max(per-org)+1 whenever NULL. The bad state becomes physically
--      impossible.
--   B. One-time backfill of every existing NULL row (this fixes the Vendor
--      campaign that's currently stuck).
--   C. Drop the IS NOT NULL filter from mkt_step1_pipeline so the Pipeline
--      column never goes blank again, even if some future code path
--      accidentally sets NULL.
--
-- Companion changes (deployed via Edge Functions + frontend in the same PR):
--   - mkt-outreach-executor: removed .not('sequence_priority', 'is', null)
--   - mkt-sequence-executor: same
--   - useArohanContext.ts:    same
-- =============================================================================


-- ── A. Auto-assign trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_campaigns_autoassign_priority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sequence_priority IS NULL THEN
    SELECT COALESCE(MAX(sequence_priority), 0) + 1
      INTO NEW.sequence_priority
    FROM public.mkt_campaigns
    WHERE org_id = NEW.org_id
      AND sequence_priority IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mkt_campaigns_autoassign_priority_trg ON public.mkt_campaigns;

CREATE TRIGGER mkt_campaigns_autoassign_priority_trg
BEFORE INSERT OR UPDATE OF sequence_priority ON public.mkt_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.mkt_campaigns_autoassign_priority();


-- ── B. Backfill any existing NULL rows ───────────────────────────────────────
-- ROW_NUMBER() per org so multi-org installs each get their own contiguous
-- priority sequence, ordered by created_at so the original creation order is
-- preserved.

WITH next_priority_per_org AS (
  SELECT
    org_id,
    COALESCE(MAX(sequence_priority), 0) AS max_priority
  FROM public.mkt_campaigns
  WHERE sequence_priority IS NOT NULL
  GROUP BY org_id
),
ranked AS (
  SELECT
    c.id,
    np.max_priority + ROW_NUMBER() OVER (PARTITION BY c.org_id ORDER BY c.created_at) AS new_priority
  FROM public.mkt_campaigns c
  LEFT JOIN next_priority_per_org np ON np.org_id = c.org_id
  WHERE c.sequence_priority IS NULL
)
UPDATE public.mkt_campaigns c
SET sequence_priority = COALESCE(r.new_priority, 1),
    updated_at        = now()
FROM ranked r
WHERE c.id = r.id;


-- ── C. Drop IS NOT NULL filter from mkt_step1_pipeline ───────────────────────
-- Pipeline column should always render for active campaigns regardless of
-- priority. Order falls back to created_at when priority is the same.

CREATE OR REPLACE FUNCTION public.mkt_step1_pipeline(p_org_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  campaign_id      uuid,
  queued           bigint,
  delivered_today  bigint,
  in_flight_today  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH step1_steps AS (
    SELECT cs.id AS step_id, cs.campaign_id
    FROM public.mkt_campaign_steps cs
    JOIN public.mkt_campaigns c ON c.id = cs.campaign_id
    WHERE c.org_id = p_org_id
      AND cs.step_number = 1
      AND cs.is_active = true
  ),
  queued AS (
    SELECT se.campaign_id, COUNT(*) AS queued
    FROM public.mkt_sequence_enrollments se
    JOIN public.mkt_campaigns c ON c.id = se.campaign_id
    WHERE c.org_id = p_org_id
      AND se.status = 'active'
      AND se.current_step = 1
    GROUP BY se.campaign_id
  ),
  today_actions AS (
    SELECT s.campaign_id,
      COUNT(*) FILTER (WHERE a.delivered_at IS NOT NULL)                          AS delivered_today,
      COUNT(*) FILTER (WHERE a.status IN ('sent','pending') AND a.delivered_at IS NULL) AS in_flight_today
    FROM public.mkt_sequence_actions a
    JOIN step1_steps s ON s.step_id = a.step_id
    WHERE a.created_at >= p_date::timestamptz
      AND a.created_at <  (p_date + 1)::timestamptz
    GROUP BY s.campaign_id
  )
  SELECT
    c.id                              AS campaign_id,
    COALESCE(q.queued,           0)  AS queued,
    COALESCE(t.delivered_today,  0)  AS delivered_today,
    COALESCE(t.in_flight_today,  0)  AS in_flight_today
  FROM public.mkt_campaigns c
  LEFT JOIN queued        q ON q.campaign_id = c.id
  LEFT JOIN today_actions t ON t.campaign_id = c.id
  WHERE c.org_id = p_org_id
  ORDER BY c.sequence_priority NULLS LAST, c.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_step1_pipeline(uuid, date) TO authenticated;
