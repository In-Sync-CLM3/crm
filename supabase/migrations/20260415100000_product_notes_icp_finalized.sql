-- ============================================================================
-- Add product_notes + icp_finalized to mkt_products
-- product_notes : free-text description entered during onboarding (fed to icp_infer)
-- icp_finalized : gates content generation — steps 4-9 only run after this is true
-- ============================================================================

ALTER TABLE mkt_products
  ADD COLUMN IF NOT EXISTS product_notes   text,
  ADD COLUMN IF NOT EXISTS icp_finalized   boolean NOT NULL DEFAULT false;

-- ============================================================================
-- Update get_campaign_stats to include trial (activated) and converted counts
-- ============================================================================

DROP FUNCTION IF EXISTS get_campaign_stats(uuid, text);

CREATE OR REPLACE FUNCTION get_campaign_stats(p_org_id uuid, p_product_key text)
RETURNS TABLE (
  sent                  bigint,
  opened                bigint,
  replied               bigint,
  failed                bigint,
  email_sent            bigint,
  wa_sent               bigint,
  active_enrollments    bigint,
  completed_enrollments bigint,
  trials                bigint,
  converted             bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*) FILTER (WHERE a.status = 'sent')                                       AS sent,
    COUNT(*) FILTER (WHERE a.opened_at IS NOT NULL)                                 AS opened,
    COUNT(*) FILTER (WHERE a.replied_at IS NOT NULL)                                AS replied,
    COUNT(*) FILTER (WHERE a.status = 'failed')                                     AS failed,
    COUNT(*) FILTER (WHERE a.channel = 'email'    AND a.status = 'sent')            AS email_sent,
    COUNT(*) FILTER (WHERE a.channel = 'whatsapp' AND a.status = 'sent')            AS wa_sent,

    -- Active / completed enrollment counts (sub-selects avoid double-counting from actions join)
    (SELECT COUNT(DISTINCT e2.id)
       FROM mkt_sequence_enrollments e2
       JOIN mkt_campaigns c2 ON e2.campaign_id = c2.id
       WHERE c2.org_id = p_org_id
         AND c2.product_key = p_product_key
         AND e2.status = 'active')                                                  AS active_enrollments,

    (SELECT COUNT(DISTINCT e2.id)
       FROM mkt_sequence_enrollments e2
       JOIN mkt_campaigns c2 ON e2.campaign_id = c2.id
       WHERE c2.org_id = p_org_id
         AND c2.product_key = p_product_key
         AND e2.status = 'completed')                                               AS completed_enrollments,

    -- Unique leads who reached the aha moment (trial signup) for this product
    (SELECT COUNT(DISTINCT ae.lead_id)
       FROM mkt_activation_events ae
       WHERE ae.org_id = p_org_id
         AND ae.product_key = p_product_key)                                        AS trials,

    -- Unique leads who converted to paying clients via this product's campaigns
    (SELECT COUNT(DISTINCT ml.id)
       FROM mkt_leads ml
       JOIN mkt_campaigns c2 ON ml.campaign_id = c2.id
       WHERE c2.org_id = p_org_id
         AND c2.product_key = p_product_key
         AND ml.status = 'converted')                                               AS converted

  FROM mkt_sequence_actions a
  JOIN mkt_sequence_enrollments e ON a.enrollment_id = e.id
  JOIN mkt_campaigns c ON e.campaign_id = c.id
  WHERE c.org_id = p_org_id
    AND c.product_key = p_product_key;
$$;
