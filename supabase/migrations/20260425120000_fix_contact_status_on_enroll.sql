-- Fix: contacts.status was never updated from 'new' after enrollment.
-- This caused the 3000-lead cap to stay permanently full with already-enrolled
-- leads, blocking new sourcing for fieldsync and other products.
--
-- 1. Backfill: mark all already-enrolled 'new' contacts as 'contacted'.
-- 2. Update enroll_new_contacts RPC to atomically set status='contacted'
--    on newly enrolled contacts so the cap self-clears going forward.

-- ── Backfill ─────────────────────────────────────────────────────────────────
UPDATE public.contacts c
   SET status = 'contacted'
 WHERE c.status = 'new'
   AND EXISTS (
     SELECT 1 FROM public.mkt_sequence_enrollments e
      WHERE e.lead_id = c.id
   );

-- ── Updated RPC ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enroll_new_contacts(
  p_org_id      UUID,
  p_campaign_id UUID,
  p_product_key TEXT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now      TIMESTAMPTZ := NOW();
  v_inserted INT;
BEGIN
  -- Insert enrollments for all unenrolled status='new' contacts for this product
  INSERT INTO public.mkt_sequence_enrollments
    (org_id, lead_id, campaign_id, current_step, status, next_action_at, enrolled_at)
  SELECT
    c.org_id,
    c.id,
    p_campaign_id,
    1,
    'active',
    v_now,
    v_now
  FROM public.contacts c
  WHERE c.org_id          = p_org_id
    AND c.mkt_product_key = p_product_key
    AND c.status          = 'new'
    AND NOT EXISTS (
      SELECT 1 FROM public.mkt_sequence_enrollments e
       WHERE e.lead_id     = c.id
         AND e.campaign_id = p_campaign_id
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Mark all newly enrolled contacts as 'contacted' so they leave the 'new'
  -- pool, freeing cap space for fresh leads from mkt-source-leads.
  UPDATE public.contacts
     SET status = 'contacted'
   WHERE org_id          = p_org_id
     AND mkt_product_key = p_product_key
     AND status          = 'new'
     AND EXISTS (
       SELECT 1 FROM public.mkt_sequence_enrollments e
        WHERE e.lead_id     = id
          AND e.campaign_id = p_campaign_id
     );

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enroll_new_contacts(UUID, UUID, TEXT) TO service_role;
