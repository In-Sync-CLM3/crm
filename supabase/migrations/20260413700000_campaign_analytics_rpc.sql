-- Add complained_at column to mkt_sequence_actions
ALTER TABLE mkt_sequence_actions
  ADD COLUMN IF NOT EXISTS complained_at timestamptz;

-- ============================================================
-- get_campaign_analytics(campaign_id)
-- Full per-campaign analytics including next fire time.
-- ============================================================
CREATE OR REPLACE FUNCTION get_campaign_analytics(p_campaign_id uuid)
RETURNS TABLE (
  enrolled            bigint,
  active_enrollments  bigint,
  completed_enrollments bigint,
  sent                bigint,
  delivered           bigint,
  opened              bigint,
  clicked             bigint,
  replied             bigint,
  failed              bigint,
  bounced             bigint,
  complained          bigint,
  next_fire_at        timestamptz,
  last_sent_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    -- Enrollment counts
    (SELECT COUNT(*) FROM mkt_sequence_enrollments
     WHERE campaign_id = p_campaign_id AND status IN ('active','completed','cancelled'))::bigint AS enrolled,
    (SELECT COUNT(*) FROM mkt_sequence_enrollments
     WHERE campaign_id = p_campaign_id AND status = 'active')::bigint AS active_enrollments,
    (SELECT COUNT(*) FROM mkt_sequence_enrollments
     WHERE campaign_id = p_campaign_id AND status = 'completed')::bigint AS completed_enrollments,

    -- Action counts (from actions belonging to this campaign's enrollments)
    COUNT(*) FILTER (WHERE a.status IN ('sent','delivered'))                AS sent,
    COUNT(*) FILTER (WHERE a.delivered_at IS NOT NULL)                      AS delivered,
    COUNT(*) FILTER (WHERE a.opened_at IS NOT NULL)                         AS opened,
    COUNT(*) FILTER (WHERE a.clicked_at IS NOT NULL)                        AS clicked,
    COUNT(*) FILTER (WHERE a.replied_at IS NOT NULL)                        AS replied,
    COUNT(*) FILTER (WHERE a.status = 'failed')                             AS failed,
    COUNT(*) FILTER (WHERE a.status = 'bounced' AND a.complained_at IS NULL) AS bounced,
    COUNT(*) FILTER (WHERE a.complained_at IS NOT NULL)                     AS complained,

    -- Timing
    (SELECT MIN(e2.next_action_at) FROM mkt_sequence_enrollments e2
     WHERE e2.campaign_id = p_campaign_id AND e2.status = 'active')         AS next_fire_at,
    MAX(a.sent_at)                                                           AS last_sent_at

  FROM mkt_sequence_actions a
  JOIN mkt_sequence_enrollments e ON a.enrollment_id = e.id
  WHERE e.campaign_id = p_campaign_id;
$$;

-- ============================================================
-- get_all_campaigns_analytics(org_id)
-- Returns analytics for all campaigns in an org (list view).
-- ============================================================
CREATE OR REPLACE FUNCTION get_all_campaigns_analytics(p_org_id uuid)
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
    (SELECT MIN(e2.next_action_at) FROM mkt_sequence_enrollments e2
     WHERE e2.campaign_id = c.id AND e2.status = 'active')                  AS next_fire_at,
    MAX(a.sent_at)                                                            AS last_sent_at

  FROM mkt_campaigns c
  LEFT JOIN mkt_sequence_enrollments e ON e.campaign_id = c.id
  LEFT JOIN mkt_sequence_actions a ON a.enrollment_id = e.id
  WHERE c.org_id = p_org_id
  GROUP BY c.id, c.name, c.status, c.product_key
  ORDER BY c.created_at DESC;
$$;

-- Index to support complained_at queries
CREATE INDEX IF NOT EXISTS idx_mkt_seq_actions_complained ON mkt_sequence_actions (complained_at)
  WHERE complained_at IS NOT NULL;
