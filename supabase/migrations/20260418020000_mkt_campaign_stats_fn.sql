-- mkt_campaign_stats: RPC for campaign analytics dashboard.
-- Returns per-campaign aggregated metrics from enrollments + actions.

CREATE OR REPLACE FUNCTION public.mkt_campaign_stats(p_org_id uuid)
RETURNS TABLE (
  campaign_id         uuid,
  name                text,
  product_key         text,
  status              text,
  sequence_priority   int,
  created_at          timestamptz,
  active_enrollments  bigint,
  total_enrollments   bigint,
  step1_sent          bigint,
  step1_failed        bigint,
  step1_skipped       bigint,
  total_opens         bigint,
  total_clicks        bigint,
  total_replies       bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.id              AS campaign_id,
    c.name,
    c.product_key,
    c.status,
    c.sequence_priority,
    c.created_at,
    COUNT(e.id) FILTER (WHERE e.status = 'active')                                          AS active_enrollments,
    COUNT(e.id)                                                                              AS total_enrollments,
    COUNT(a.id) FILTER (WHERE a.status IN ('sent','delivered') AND a.step_number = 1)       AS step1_sent,
    COUNT(a.id) FILTER (WHERE a.status = 'failed'              AND a.step_number = 1)       AS step1_failed,
    COUNT(a.id) FILTER (WHERE a.status = 'skipped'             AND a.step_number = 1)       AS step1_skipped,
    COUNT(a.id) FILTER (WHERE a.opened_at IS NOT NULL)                                      AS total_opens,
    COUNT(a.id) FILTER (WHERE a.clicked_at IS NOT NULL)                                     AS total_clicks,
    COUNT(a.id) FILTER (WHERE a.replied_at IS NOT NULL)                                     AS total_replies
  FROM public.mkt_campaigns c
  LEFT JOIN public.mkt_sequence_enrollments e ON e.campaign_id = c.id
  LEFT JOIN public.mkt_sequence_actions     a ON a.enrollment_id = e.id
  WHERE c.org_id = p_org_id
  GROUP BY c.id, c.name, c.product_key, c.status, c.sequence_priority, c.created_at
  ORDER BY c.sequence_priority NULLS LAST, c.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_campaign_stats(uuid) TO authenticated;
