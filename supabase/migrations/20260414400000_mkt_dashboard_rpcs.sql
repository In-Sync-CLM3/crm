-- Dashboard stats RPCs: replace JS-side aggregation with DB-side SQL
-- Called by marketing dashboard components via supabase.rpc()

-- 1. Channel stats: group mkt_sequence_actions by channel for the given period
CREATE OR REPLACE FUNCTION get_channel_stats(p_org_id uuid, p_since timestamptz)
RETURNS TABLE (
  channel         text,
  sent            bigint,
  delivered       bigint,
  opened          bigint,
  clicked         bigint,
  replied         bigint,
  bounced         bigint,
  failed          bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    channel::text,
    COUNT(*) FILTER (WHERE status IN ('sent','delivered','bounced'))  AS sent,
    COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)                  AS delivered,
    COUNT(*) FILTER (WHERE opened_at    IS NOT NULL)                  AS opened,
    COUNT(*) FILTER (WHERE clicked_at   IS NOT NULL)                  AS clicked,
    COUNT(*) FILTER (WHERE replied_at   IS NOT NULL)                  AS replied,
    COUNT(*) FILTER (WHERE status = 'bounced')                        AS bounced,
    COUNT(*) FILTER (WHERE status = 'failed')                         AS failed
  FROM mkt_sequence_actions
  WHERE org_id = p_org_id
    AND created_at >= p_since
  GROUP BY channel
  ORDER BY channel;
$$;

-- 2. Lead funnel stats: enrollment counts grouped by status for the given period
CREATE OR REPLACE FUNCTION get_lead_funnel_stats(p_org_id uuid, p_since timestamptz)
RETURNS TABLE (
  status          text,
  cnt             bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status::text, COUNT(*) AS cnt
  FROM mkt_sequence_enrollments
  WHERE org_id = p_org_id
    AND created_at >= p_since
  GROUP BY status;
$$;

-- 3. Marketing overview: single call returning all KPIs
CREATE OR REPLACE FUNCTION get_marketing_overview(p_org_id uuid, p_since timestamptz)
RETURNS TABLE (
  active_campaigns    bigint,
  total_enrollments   bigint,
  active_enrollments  bigint,
  completed_enrollments bigint,
  total_actions       bigint,
  channel             text,
  ch_sent             bigint,
  ch_opened           bigint,
  ch_clicked          bigint,
  ch_replied          bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Active campaign count
  WITH camp AS (
    SELECT COUNT(*) AS active_campaigns
    FROM mkt_campaigns
    WHERE org_id = p_org_id AND status = 'active'
  ),
  -- Enrollment breakdown
  enroll AS (
    SELECT
      COUNT(*)                                           AS total_enrollments,
      COUNT(*) FILTER (WHERE status = 'active')          AS active_enrollments,
      COUNT(*) FILTER (WHERE status = 'completed')       AS completed_enrollments
    FROM mkt_sequence_enrollments
    WHERE org_id = p_org_id AND created_at >= p_since
  ),
  -- Action totals + channel breakdown
  acts AS (
    SELECT
      COUNT(*)  AS total_actions,
      channel::text,
      COUNT(*) FILTER (WHERE status IN ('sent','delivered','bounced')) AS ch_sent,
      COUNT(*) FILTER (WHERE opened_at  IS NOT NULL)                   AS ch_opened,
      COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)                   AS ch_clicked,
      COUNT(*) FILTER (WHERE replied_at IS NOT NULL)                   AS ch_replied
    FROM mkt_sequence_actions
    WHERE org_id = p_org_id AND created_at >= p_since
    GROUP BY channel
  )
  SELECT
    camp.active_campaigns,
    enroll.total_enrollments,
    enroll.active_enrollments,
    enroll.completed_enrollments,
    acts.total_actions,
    acts.channel,
    acts.ch_sent,
    acts.ch_opened,
    acts.ch_clicked,
    acts.ch_replied
  FROM camp, enroll, acts;
$$;

GRANT EXECUTE ON FUNCTION get_channel_stats(uuid, timestamptz)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_lead_funnel_stats(uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_marketing_overview(uuid, timestamptz) TO authenticated, service_role;
