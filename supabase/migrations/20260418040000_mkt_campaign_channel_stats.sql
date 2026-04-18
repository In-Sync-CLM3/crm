-- mkt_campaign_channel_stats: per-campaign, per-channel action aggregates.
-- Powers the channel-aware campaign cards in the Marketing dashboard.

CREATE OR REPLACE FUNCTION public.mkt_campaign_channel_stats(p_org_id uuid)
RETURNS TABLE (
  campaign_id   uuid,
  channel       text,
  sent          bigint,
  failed        bigint,
  delivered     bigint,
  opens         bigint,
  clicks        bigint,
  replies       bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.id                                                                              AS campaign_id,
    a.channel,
    COUNT(a.id) FILTER (WHERE a.status IN ('sent','delivered') AND a.step_number = 1) AS sent,
    COUNT(a.id) FILTER (WHERE a.status = 'failed'              AND a.step_number = 1) AS failed,
    COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL       AND a.step_number = 1) AS delivered,
    COUNT(a.id) FILTER (WHERE a.opened_at   IS NOT NULL)                              AS opens,
    COUNT(a.id) FILTER (WHERE a.clicked_at  IS NOT NULL)                              AS clicks,
    COUNT(a.id) FILTER (WHERE a.replied_at  IS NOT NULL)                              AS replies
  FROM public.mkt_campaigns            c
  JOIN public.mkt_sequence_enrollments e ON e.campaign_id   = c.id
  JOIN public.mkt_sequence_actions     a ON a.enrollment_id = e.id
  WHERE c.org_id = p_org_id
  GROUP BY c.id, a.channel
  ORDER BY c.sequence_priority NULLS LAST, c.name, a.channel;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_campaign_channel_stats(uuid) TO authenticated;
