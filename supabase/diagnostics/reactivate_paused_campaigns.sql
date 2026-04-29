-- =============================================================================
-- Re-activate the three "Initial Outbound" campaigns that are currently Paused:
--   - Vendorverification - Initial Outbound
--   - Whatsapp - Initial Outbound
--   - Globalcrm - Initial Outbound
--
-- Background: these are auto-paused by toggle_product_active(_, false) when
-- their parent product in mkt_products is deactivated. See migration
-- 20260417000001_fix_toggle_product_active.sql.
--
-- USAGE:
--   1. Run STEP 1 (dry run). Confirm the three campaigns + their products and
--      product.active state look correct.
--   2. Choose ONE of:
--        STEP 2A (recommended) - re-activates the parent product, which
--          cascades and also resumes paused mkt_sequence_enrollments with a
--          proper next_action_at. This is what the UI's "Active" toggle does.
--        STEP 2B (campaigns only) - flips ONLY mkt_campaigns.status to
--          'active' and leaves the parent product inactive and enrollments
--          paused. Use this if you want the campaign rows to read "Active"
--          but do NOT want outbound messages to start flowing yet.
--
-- Both apply scripts run inside a transaction. Review the RETURNING rows then
-- COMMIT or ROLLBACK.
-- =============================================================================


-- =============================================================================
-- STEP 1 -- DRY RUN: show what we'd touch.
-- =============================================================================
SELECT
  c.id                AS campaign_id,
  c.org_id,
  c.name              AS campaign_name,
  c.status            AS campaign_status,
  c.product_key,
  p.id                AS product_id,
  p.product_name,
  p.active            AS product_active,
  (
    SELECT count(*) FROM public.mkt_sequence_enrollments e
    WHERE e.campaign_id = c.id AND e.status = 'paused'
  )                   AS paused_enrollments
FROM public.mkt_campaigns c
LEFT JOIN public.mkt_products p
  ON p.org_id = c.org_id AND p.product_key = c.product_key
WHERE c.status = 'paused'
  AND c.name IN (
    'Vendorverification - Initial Outbound',
    'Whatsapp - Initial Outbound',
    'Globalcrm - Initial Outbound'
  )
ORDER BY c.name;


-- =============================================================================
-- STEP 2A -- APPLY (recommended): re-activate the parent products.
--
-- Calls the existing toggle_product_active RPC, which:
--   * sets mkt_products.active = true,
--   * flips matching paused mkt_campaigns back to 'active',
--   * resumes paused mkt_sequence_enrollments and re-computes next_action_at.
-- =============================================================================
BEGIN;

WITH targets AS (
  SELECT DISTINCT p.id AS product_id, p.product_name, p.active AS was_active
  FROM public.mkt_campaigns c
  JOIN public.mkt_products p
    ON p.org_id = c.org_id AND p.product_key = c.product_key
  WHERE c.status = 'paused'
    AND c.name IN (
      'Vendorverification - Initial Outbound',
      'Whatsapp - Initial Outbound',
      'Globalcrm - Initial Outbound'
    )
)
SELECT
  product_id,
  product_name,
  was_active,
  public.toggle_product_active(product_id, true) AS toggled
FROM targets;

-- Verify the resulting state before committing:
SELECT
  c.name              AS campaign_name,
  c.status            AS campaign_status,
  p.product_name,
  p.active            AS product_active,
  (
    SELECT count(*) FROM public.mkt_sequence_enrollments e
    WHERE e.campaign_id = c.id AND e.status = 'active'
  )                   AS active_enrollments
FROM public.mkt_campaigns c
JOIN public.mkt_products p
  ON p.org_id = c.org_id AND p.product_key = c.product_key
WHERE c.name IN (
  'Vendorverification - Initial Outbound',
  'Whatsapp - Initial Outbound',
  'Globalcrm - Initial Outbound'
)
ORDER BY c.name;

-- COMMIT;   -- uncomment to apply
-- ROLLBACK; -- uncomment to discard


-- =============================================================================
-- STEP 2B -- APPLY (campaigns only, no enrollment resume):
-- =============================================================================
-- BEGIN;
--
-- UPDATE public.mkt_campaigns
-- SET status = 'active', updated_at = now()
-- WHERE status = 'paused'
--   AND name IN (
--     'Vendorverification - Initial Outbound',
--     'Whatsapp - Initial Outbound',
--     'Globalcrm - Initial Outbound'
--   )
-- RETURNING id, name, status, product_key, updated_at;
--
-- -- COMMIT;
-- -- ROLLBACK;
