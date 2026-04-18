-- mkt_engine_daily_stats: daily sends/opens/clicks by channel across ALL campaigns.
-- Powers the engine overview area chart (email + whatsapp stacked by day).

CREATE OR REPLACE FUNCTION public.mkt_engine_daily_stats(
  p_org_id uuid,
  p_days   int DEFAULT 30
)
RETURNS TABLE (
  date    date,
  channel text,
  sent    bigint,
  opens   bigint,
  clicks  bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    a.created_at::date AS date,
    a.channel,
    COUNT(a.id) FILTER (WHERE a.status IN ('sent','delivered')) AS sent,
    COUNT(a.id) FILTER (WHERE a.opened_at  IS NOT NULL)         AS opens,
    COUNT(a.id) FILTER (WHERE a.clicked_at IS NOT NULL)         AS clicks
  FROM public.mkt_campaigns            c
  JOIN public.mkt_sequence_enrollments e ON e.campaign_id   = c.id
  JOIN public.mkt_sequence_actions     a ON a.enrollment_id = e.id
  WHERE c.org_id      = p_org_id
    AND a.created_at >= now() - (p_days || ' days')::interval
  GROUP BY a.created_at::date, a.channel
  ORDER BY a.created_at::date, a.channel;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_engine_daily_stats(uuid, int) TO authenticated;
