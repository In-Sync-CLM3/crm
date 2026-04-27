-- Returns campaign execution stats for a given org + product_key.
-- Used by the ProductManagement UI to show sent/opened/replied counts per product card.

-- Drop first: an earlier version of this function had a different RETURNS TABLE
-- shape, and CREATE OR REPLACE cannot change a function's return type.
DROP FUNCTION IF EXISTS get_campaign_stats(uuid, text);

CREATE OR REPLACE FUNCTION get_campaign_stats(p_org_id uuid, p_product_key text)
RETURNS TABLE (
  sent            bigint,
  opened          bigint,
  replied         bigint,
  failed          bigint,
  email_sent      bigint,
  wa_sent         bigint,
  active_enrollments   bigint,
  completed_enrollments bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*) FILTER (WHERE a.status = 'sent')                         AS sent,
    COUNT(*) FILTER (WHERE a.opened_at IS NOT NULL)                   AS opened,
    COUNT(*) FILTER (WHERE a.replied_at IS NOT NULL)                  AS replied,
    COUNT(*) FILTER (WHERE a.status = 'failed')                       AS failed,
    COUNT(*) FILTER (WHERE a.channel = 'email'    AND a.status = 'sent') AS email_sent,
    COUNT(*) FILTER (WHERE a.channel = 'whatsapp' AND a.status = 'sent') AS wa_sent,
    (SELECT COUNT(*) FROM mkt_sequence_enrollments e2
       JOIN mkt_campaigns c2 ON e2.campaign_id = c2.id
       WHERE c2.org_id = p_org_id AND c2.product_key = p_product_key AND e2.status = 'active')   AS active_enrollments,
    (SELECT COUNT(*) FROM mkt_sequence_enrollments e2
       JOIN mkt_campaigns c2 ON e2.campaign_id = c2.id
       WHERE c2.org_id = p_org_id AND c2.product_key = p_product_key AND e2.status = 'completed') AS completed_enrollments
  FROM mkt_sequence_actions a
  JOIN mkt_sequence_enrollments e ON a.enrollment_id = e.id
  JOIN mkt_campaigns c ON e.campaign_id = c.id
  WHERE c.org_id = p_org_id
    AND c.product_key = p_product_key;
$$;
