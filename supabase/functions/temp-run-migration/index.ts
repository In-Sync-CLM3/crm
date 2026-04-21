import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

Deno.serve(async () => {
  const client = new Client(Deno.env.get("SUPABASE_DB_URL")!);
  await client.connect();

  const sql = `
-- Drop first because we're changing the return type (adding ga4 columns)
DROP FUNCTION IF EXISTS get_all_campaigns_analytics(uuid);
DROP FUNCTION IF EXISTS get_campaign_analytics(uuid);

CREATE FUNCTION get_all_campaigns_analytics(p_org_id uuid)
RETURNS TABLE (
  campaign_id         uuid,
  campaign_name       text,
  campaign_status     text,
  product_key         text,
  enrolled            bigint,
  active_enrollments  bigint,
  sent                bigint,
  delivered           bigint,
  opened              bigint,
  clicked             bigint,
  replied             bigint,
  failed              bigint,
  complained          bigint,
  ga4_sessions        bigint,
  ga4_engaged_sessions bigint,
  next_fire_at        timestamptz,
  last_sent_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.id AS campaign_id,
    c.name AS campaign_name,
    c.status AS campaign_status,
    c.product_key,
    (SELECT COUNT(*) FROM mkt_sequence_enrollments
     WHERE campaign_id = c.id AND status IN ('active','completed','cancelled'))::bigint AS enrolled,
    (SELECT COUNT(*) FROM mkt_sequence_enrollments
     WHERE campaign_id = c.id AND status = 'active')::bigint AS active_enrollments,
    COUNT(*) FILTER (WHERE a.status IN ('sent','delivered'))                 AS sent,
    COUNT(*) FILTER (WHERE a.delivered_at IS NOT NULL)                       AS delivered,
    COUNT(*) FILTER (WHERE a.opened_at IS NOT NULL)                          AS opened,
    COUNT(*) FILTER (WHERE a.clicked_at IS NOT NULL)                         AS clicked,
    COUNT(*) FILTER (WHERE a.replied_at IS NOT NULL)                         AS replied,
    COUNT(*) FILTER (WHERE a.status = 'failed')                              AS failed,
    COUNT(*) FILTER (WHERE a.complained_at IS NOT NULL)                      AS complained,
    MAX(COALESCE(g.ga4_sessions, 0))::bigint          AS ga4_sessions,
    MAX(COALESCE(g.ga4_engaged_sessions, 0))::bigint  AS ga4_engaged_sessions,
    (SELECT MIN(e2.next_action_at) FROM mkt_sequence_enrollments e2
     WHERE e2.campaign_id = c.id AND e2.status = 'active')                  AS next_fire_at,
    MAX(a.sent_at)                                                            AS last_sent_at
  FROM mkt_campaigns c
  LEFT JOIN mkt_sequence_enrollments e ON e.campaign_id = c.id
  LEFT JOIN mkt_sequence_actions a ON a.enrollment_id = e.id
  LEFT JOIN (
    SELECT
      org_id,
      product_key,
      campaign_slug,
      SUM(sessions)::bigint         AS ga4_sessions,
      SUM(engaged_sessions)::bigint AS ga4_engaged_sessions
    FROM mkt_ga4_traffic
    GROUP BY org_id, product_key, campaign_slug
  ) g ON g.org_id = c.org_id
     AND g.product_key = c.product_key
     AND g.campaign_slug = lower(regexp_replace(c.name, '[[:space:]]+', '_', 'g'))
  WHERE c.org_id = p_org_id
  GROUP BY c.id, c.name, c.status, c.product_key
  ORDER BY c.created_at DESC;
$$;

CREATE FUNCTION get_campaign_analytics(p_campaign_id uuid)
RETURNS TABLE (
  enrolled              bigint,
  active_enrollments    bigint,
  completed_enrollments bigint,
  sent                  bigint,
  delivered             bigint,
  opened                bigint,
  clicked               bigint,
  replied               bigint,
  failed                bigint,
  bounced               bigint,
  complained            bigint,
  ga4_sessions          bigint,
  ga4_engaged_sessions  bigint,
  next_fire_at          timestamptz,
  last_sent_at          timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    (SELECT COUNT(*) FROM mkt_sequence_enrollments
     WHERE campaign_id = p_campaign_id AND status IN ('active','completed','cancelled'))::bigint AS enrolled,
    (SELECT COUNT(*) FROM mkt_sequence_enrollments
     WHERE campaign_id = p_campaign_id AND status = 'active')::bigint AS active_enrollments,
    (SELECT COUNT(*) FROM mkt_sequence_enrollments
     WHERE campaign_id = p_campaign_id AND status = 'completed')::bigint AS completed_enrollments,
    COUNT(*) FILTER (WHERE a.status IN ('sent','delivered'))                AS sent,
    COUNT(*) FILTER (WHERE a.delivered_at IS NOT NULL)                      AS delivered,
    COUNT(*) FILTER (WHERE a.opened_at IS NOT NULL)                         AS opened,
    COUNT(*) FILTER (WHERE a.clicked_at IS NOT NULL)                        AS clicked,
    COUNT(*) FILTER (WHERE a.replied_at IS NOT NULL)                        AS replied,
    COUNT(*) FILTER (WHERE a.status = 'failed')                             AS failed,
    COUNT(*) FILTER (WHERE a.status = 'bounced' AND a.complained_at IS NULL) AS bounced,
    COUNT(*) FILTER (WHERE a.complained_at IS NOT NULL)                     AS complained,
    MAX(COALESCE(g.ga4_sessions, 0))::bigint         AS ga4_sessions,
    MAX(COALESCE(g.ga4_engaged_sessions, 0))::bigint AS ga4_engaged_sessions,
    (SELECT MIN(e2.next_action_at) FROM mkt_sequence_enrollments e2
     WHERE e2.campaign_id = p_campaign_id AND e2.status = 'active')        AS next_fire_at,
    MAX(a.sent_at)                                                          AS last_sent_at
  FROM mkt_sequence_actions a
  JOIN mkt_sequence_enrollments e ON a.enrollment_id = e.id
  LEFT JOIN (
    SELECT
      g2.org_id, g2.product_key, g2.campaign_slug,
      SUM(g2.sessions)::bigint         AS ga4_sessions,
      SUM(g2.engaged_sessions)::bigint AS ga4_engaged_sessions
    FROM mkt_ga4_traffic g2
    GROUP BY g2.org_id, g2.product_key, g2.campaign_slug
  ) g ON g.product_key = (SELECT product_key FROM mkt_campaigns WHERE id = p_campaign_id)
     AND g.org_id      = (SELECT org_id      FROM mkt_campaigns WHERE id = p_campaign_id)
     AND g.campaign_slug = lower(regexp_replace(
           (SELECT name FROM mkt_campaigns WHERE id = p_campaign_id), '\s+', '_', 'g'))
  WHERE e.campaign_id = p_campaign_id;
$$;
`;

  try {
    await client.queryArray(sql);
    await client.end();
    return new Response(JSON.stringify({ ok: true, message: "Migration applied: both RPCs now include ga4_sessions and ga4_engaged_sessions" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    await client.end();
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
