-- mkt_step1_pipeline: per-campaign step-1 cold outreach pipeline status.
-- Returns queued count + today's delivery progress for ALL campaigns (incl. paused).
-- Used by DailyReport to show the "Pipeline" column without hitting the 1000-row client limit.

CREATE OR REPLACE FUNCTION public.mkt_step1_pipeline(p_org_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  campaign_id      uuid,
  queued           bigint,   -- step-1 enrollments waiting to be contacted
  delivered_today  bigint,   -- confirmed deliveries today (counts against the 100/day cap)
  in_flight_today  bigint    -- sent today but not yet confirmed
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH step1_steps AS (
    -- Step-1 step IDs per campaign for this org
    SELECT cs.id AS step_id, cs.campaign_id
    FROM public.mkt_campaign_steps cs
    JOIN public.mkt_campaigns c ON c.id = cs.campaign_id
    WHERE c.org_id = p_org_id
      AND cs.step_number = 1
      AND cs.is_active = true
  ),
  queued AS (
    -- Total active step-1 enrollments still waiting (pipeline depth)
    SELECT se.campaign_id, COUNT(*) AS queued
    FROM public.mkt_sequence_enrollments se
    JOIN public.mkt_campaigns c ON c.id = se.campaign_id
    WHERE c.org_id = p_org_id
      AND se.status = 'active'
      AND se.current_step = 1
    GROUP BY se.campaign_id
  ),
  today_actions AS (
    -- Today's step-1 action counts per campaign
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
    AND c.sequence_priority IS NOT NULL
  ORDER BY c.sequence_priority;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_step1_pipeline(uuid, date) TO authenticated;
