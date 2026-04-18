-- mkt_campaign_daily_stats: per-campaign, per-day action aggregates for heatmap UI.

CREATE OR REPLACE FUNCTION public.mkt_campaign_daily_stats(
  p_org_id uuid,
  p_days   int DEFAULT 30
)
RETURNS TABLE (
  campaign_id   uuid,
  campaign_name text,
  date          date,
  sent          bigint,
  failed        bigint,
  opens         bigint,
  clicks        bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.id               AS campaign_id,
    c.name             AS campaign_name,
    a.created_at::date AS date,
    COUNT(*) FILTER (WHERE a.status IN ('sent','delivered')) AS sent,
    COUNT(*) FILTER (WHERE a.status = 'failed')              AS failed,
    COUNT(*) FILTER (WHERE a.opened_at  IS NOT NULL)         AS opens,
    COUNT(*) FILTER (WHERE a.clicked_at IS NOT NULL)         AS clicks
  FROM public.mkt_campaigns            c
  JOIN public.mkt_sequence_enrollments e ON e.campaign_id  = c.id
  JOIN public.mkt_sequence_actions     a ON a.enrollment_id = e.id
  WHERE c.org_id      = p_org_id
    AND a.created_at >= now() - (p_days || ' days')::interval
  GROUP BY c.id, c.name, a.created_at::date
  ORDER BY c.name, a.created_at::date;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_campaign_daily_stats(uuid, int) TO authenticated;
