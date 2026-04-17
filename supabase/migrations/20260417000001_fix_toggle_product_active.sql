-- SoT fix #8: replace metadata->>'product_key' with the product_key column in toggle_product_active.
-- The product_key column is the single source of truth; metadata.product_key was a stale copy.

CREATE OR REPLACE FUNCTION public.toggle_product_active(
  _product_id uuid,
  _active boolean
) RETURNS void AS $$
DECLARE
  _org_id     uuid;
  _product_key text;
BEGIN
  SELECT org_id, product_key INTO _org_id, _product_key
  FROM public.mkt_products WHERE id = _product_id;

  UPDATE public.mkt_products
  SET active = _active, updated_at = now()
  WHERE id = _product_id;

  IF NOT _active THEN
    UPDATE public.mkt_campaigns
    SET status = 'paused', updated_at = now()
    WHERE org_id = _org_id AND product_key = _product_key AND status = 'active';

    UPDATE public.mkt_sequence_enrollments
    SET status = 'paused', updated_at = now()
    WHERE campaign_id IN (
      SELECT id FROM public.mkt_campaigns
      WHERE org_id = _org_id AND product_key = _product_key
    ) AND status = 'active';

  ELSE
    UPDATE public.mkt_campaigns
    SET status = 'active', updated_at = now()
    WHERE org_id = _org_id AND product_key = _product_key AND status = 'paused';

    UPDATE public.mkt_sequence_enrollments
    SET status = 'active',
      next_action_at = now() + (COALESCE((
        SELECT (cs.delay_hours || ' hours')::interval
        FROM public.mkt_campaign_steps cs
        WHERE cs.campaign_id = mkt_sequence_enrollments.campaign_id
          AND cs.step_number = mkt_sequence_enrollments.current_step
      ), '1 hour'::interval)),
      updated_at = now()
    WHERE campaign_id IN (
      SELECT id FROM public.mkt_campaigns
      WHERE org_id = _org_id AND product_key = _product_key
    ) AND status = 'paused';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
