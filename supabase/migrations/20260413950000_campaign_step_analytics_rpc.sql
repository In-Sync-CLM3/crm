-- Per-step analytics for the sequence funnel view.
-- Returns one row per step with engagement metrics + in-queue count.

CREATE OR REPLACE FUNCTION get_campaign_step_analytics(p_campaign_id uuid)
RETURNS TABLE (
  step_id      uuid,
  step_number  int,
  channel      text,
  delay_hours  int,
  template_id  uuid,
  in_queue     bigint,   -- enrollments currently waiting at this step
  sent         bigint,   -- actions sent/delivered
  delivered    bigint,
  opened       bigint,
  clicked      bigint,
  replied      bigint,
  failed       bigint,
  bounced      bigint,
  skipped      bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    s.id                                                                          AS step_id,
    s.step_number,
    s.channel,
    s.delay_hours,
    s.template_id,
    -- Contacts currently queued at this step (active enrollments, not yet sent)
    (SELECT COUNT(*) FROM mkt_sequence_enrollments e2
     WHERE e2.campaign_id = p_campaign_id
       AND e2.status      = 'active'
       AND e2.current_step = s.step_number)::bigint                              AS in_queue,
    -- Action outcome metrics
    COUNT(*) FILTER (WHERE a.status IN ('sent','delivered'))                      AS sent,
    COUNT(*) FILTER (WHERE a.delivered_at IS NOT NULL)                            AS delivered,
    COUNT(*) FILTER (WHERE a.opened_at IS NOT NULL)                               AS opened,
    COUNT(*) FILTER (WHERE a.clicked_at IS NOT NULL)                              AS clicked,
    COUNT(*) FILTER (WHERE a.replied_at IS NOT NULL)                              AS replied,
    COUNT(*) FILTER (WHERE a.status = 'failed')                                   AS failed,
    COUNT(*) FILTER (WHERE a.status = 'bounced')                                  AS bounced,
    COUNT(*) FILTER (WHERE a.status = 'skipped')                                  AS skipped
  FROM mkt_campaign_steps s
  LEFT JOIN mkt_sequence_actions a ON a.step_id = s.id
  WHERE s.campaign_id = p_campaign_id
    AND s.is_active    = true
  GROUP BY s.id, s.step_number, s.channel, s.delay_hours, s.template_id
  ORDER BY s.step_number;
$$;
