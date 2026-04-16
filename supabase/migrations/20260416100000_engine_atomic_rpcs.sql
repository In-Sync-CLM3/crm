-- ---------------------------------------------------------------------------
-- Phase 2: Atomic RPCs for race-condition-prone engine operations
-- ---------------------------------------------------------------------------

-- 1. increment_engagement_score
--    Replaces the read-modify-write pattern in mkt-email-webhook.
--    Uses FOR UPDATE to serialize concurrent open/click events for the same lead.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_engagement_score(
  p_action_id   UUID,
  p_event_type  TEXT,
  p_score_delta INT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enrollment_id  UUID;
  v_org_id         TEXT;
  v_lead_id        UUID;
  v_cur_engagement INT;
  v_cur_total      INT;
  v_new_engagement INT;
  v_new_total      INT;
BEGIN
  -- Resolve action → enrollment → lead
  SELECT enrollment_id, org_id
    INTO v_enrollment_id, v_org_id
    FROM mkt_sequence_actions
   WHERE id = p_action_id;

  IF v_enrollment_id IS NULL THEN RETURN; END IF;

  SELECT lead_id
    INTO v_lead_id
    FROM mkt_sequence_enrollments
   WHERE id = v_enrollment_id;

  IF v_lead_id IS NULL THEN RETURN; END IF;

  -- Lock the score row to prevent concurrent updates
  SELECT engagement_score, total_score
    INTO v_cur_engagement, v_cur_total
    FROM mkt_lead_scores
   WHERE lead_id = v_lead_id
     FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  v_new_engagement := LEAST(30, COALESCE(v_cur_engagement, 0) + p_score_delta);
  v_new_total      := COALESCE(v_cur_total, 0) - COALESCE(v_cur_engagement, 0) + v_new_engagement;

  UPDATE mkt_lead_scores
     SET engagement_score = v_new_engagement,
         total_score      = v_new_total,
         scored_at        = NOW()
   WHERE lead_id = v_lead_id;

  UPDATE mkt_leads
     SET engagement_score = v_new_engagement,
         total_score      = v_new_total
   WHERE id = v_lead_id;

  INSERT INTO mkt_lead_score_history
    (org_id, lead_id, previous_total, new_total, engagement_delta, reason, triggered_by)
  VALUES
    (v_org_id, v_lead_id, v_cur_total, v_new_total, p_score_delta, p_event_type, p_event_type);
END;
$$;

-- 2. advance_enrollment_step
--    Replaces the advanceToNextStep() helper in mkt-sequence-executor.
--    Single DB round-trip: looks up next step and updates enrollment atomically.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION advance_enrollment_step(
  p_enrollment_id UUID,
  p_current_step  INT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign_id  UUID;
  v_next_step    INT;
  v_delay_hours  NUMERIC;
BEGIN
  SELECT campaign_id
    INTO v_campaign_id
    FROM mkt_sequence_enrollments
   WHERE id = p_enrollment_id;

  -- Find next active step after the current one
  SELECT step_number, delay_hours
    INTO v_next_step, v_delay_hours
    FROM mkt_campaign_steps
   WHERE campaign_id = v_campaign_id
     AND is_active   = true
     AND step_number > p_current_step
   ORDER BY step_number ASC
   LIMIT 1;

  IF v_next_step IS NULL THEN
    -- No more steps — mark enrollment completed
    UPDATE mkt_sequence_enrollments
       SET status       = 'completed',
           completed_at = NOW(),
           current_step = p_current_step
     WHERE id = p_enrollment_id;
  ELSE
    -- Advance to next step, scheduling based on delay_hours
    UPDATE mkt_sequence_enrollments
       SET current_step   = v_next_step,
           next_action_at = NOW() + (COALESCE(v_delay_hours, 0) * INTERVAL '1 hour')
     WHERE id = p_enrollment_id;
  END IF;
END;
$$;

-- 3. enroll_new_contacts
--    Replaces the paginated while-loop in mkt-daily-lead-refresh.
--    Single INSERT … SELECT with NOT EXISTS dedup — fully atomic.
--    Returns count of newly enrolled contacts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enroll_new_contacts(
  p_org_id      UUID,
  p_campaign_id UUID,
  p_product_key TEXT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now       TIMESTAMPTZ := NOW();
  v_inserted  INT;
BEGIN
  INSERT INTO mkt_sequence_enrollments
    (org_id, lead_id, campaign_id, current_step, status, next_action_at, enrolled_at)
  SELECT
    c.org_id,
    c.id,
    p_campaign_id,
    1,
    'active',
    v_now,
    v_now
  FROM contacts c
  WHERE c.org_id          = p_org_id
    AND c.mkt_product_key = p_product_key
    AND c.status          = 'new'
    AND NOT EXISTS (
      SELECT 1 FROM mkt_sequence_enrollments e
       WHERE e.lead_id     = c.id
         AND e.campaign_id = p_campaign_id
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- Grant execute to the service role so edge functions can call these
GRANT EXECUTE ON FUNCTION increment_engagement_score(UUID, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION advance_enrollment_step(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION enroll_new_contacts(UUID, UUID, TEXT) TO service_role;
