-- mkt_product_channel_summary: Full plan + live metrics per product × channel.
-- Powers Strategy Grid (Approach A) and Journey Lanes (Approach B).

CREATE OR REPLACE FUNCTION public.mkt_product_channel_summary(p_org_id uuid)
RETURNS TABLE (
  product_key        text,
  channel            text,
  plan_status        text,
  planned_start_date date,
  actual_start_date  date,
  sent               bigint,
  failed             bigint,
  delivered          bigint,
  opens              bigint,
  clicks             bigint,
  replies            bigint,
  last_active_date   date,
  daily_7d_avg       numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    cp.product_key,
    cp.channel,
    cp.status                                                                  AS plan_status,
    cp.planned_start_date,
    cp.actual_start_date,
    COALESCE(COUNT(a.id) FILTER (WHERE a.status IN ('sent','delivered')), 0)   AS sent,
    COALESCE(COUNT(a.id) FILTER (WHERE a.status = 'failed'), 0)                AS failed,
    COALESCE(COUNT(a.id) FILTER (WHERE a.delivered_at IS NOT NULL), 0)         AS delivered,
    COALESCE(COUNT(a.id) FILTER (WHERE a.opened_at   IS NOT NULL), 0)          AS opens,
    COALESCE(COUNT(a.id) FILTER (WHERE a.clicked_at  IS NOT NULL), 0)          AS clicks,
    COALESCE(COUNT(a.id) FILTER (WHERE a.replied_at  IS NOT NULL), 0)          AS replies,
    MAX(a.created_at)::date                                                     AS last_active_date,
    ROUND(
      COALESCE(COUNT(a.id) FILTER (
        WHERE a.status IN ('sent','delivered')
          AND a.created_at >= now() - '7 days'::interval
      ), 0)::numeric / 7, 1
    )                                                                           AS daily_7d_avg
  FROM public.mkt_channel_plan         cp
  LEFT JOIN public.mkt_campaigns       camp ON camp.org_id      = cp.org_id
                                           AND camp.product_key = cp.product_key
  LEFT JOIN public.mkt_sequence_enrollments e ON e.campaign_id  = camp.id
  LEFT JOIN public.mkt_sequence_actions     a ON a.enrollment_id = e.id
                                           AND a.channel        = cp.channel
  WHERE cp.org_id = p_org_id
  GROUP BY cp.product_key, cp.channel, cp.status, cp.planned_start_date, cp.actual_start_date
  ORDER BY cp.product_key, cp.channel;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_product_channel_summary(uuid) TO authenticated;
