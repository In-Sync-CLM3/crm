-- ============================================================
-- Heal orphaned mkt_campaign_steps.template_id values.
--
-- mkt_campaign_steps.template_id is a plain uuid with no FK, so when the
-- email_templates / whatsapp_templates / call_scripts steps are regenerated
-- (delete-and-recreate via clearStepOutput in mkt-product-manager) the step
-- rows keep dangling IDs. The sender then 404s on the template lookup and
-- every action lands in `failed`, never `sent`.
--
-- Symptom on Expense product (27 Apr 2026): 3,356 enrolled, 0 sent — campaign
-- created 25 Apr, templates regenerated ~6h before the report.
--
-- Strategy:
--   1. NULL out template_ids that no longer point to a live template.
--   2. Per campaign, walk steps in order and assign templates positionally
--      (Nth email step → Nth `${product_key}-%` email template by created_at;
--      same for WhatsApp). Mirrors the relinker in handleToggle.
--   3. Wake up enrollments parked in the future (but not the toggle-off
--      sentinel 2099-12-31) so the executor picks them up on the next tick.
-- ============================================================

DO $$
DECLARE
  c          RECORD;
  s          RECORD;
  email_tpls UUID[];
  wa_tpls    UUID[];
  email_idx  INT;
  wa_idx     INT;
  next_tpl   UUID;
BEGIN
  -- 1. Drop dangling references so the relinker treats them as unlinked.
  UPDATE mkt_campaign_steps cs
     SET template_id = NULL
   WHERE cs.channel = 'email'
     AND cs.template_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM mkt_email_templates et
        WHERE et.id = cs.template_id AND et.is_active = true
     );

  UPDATE mkt_campaign_steps cs
     SET template_id = NULL
   WHERE cs.channel = 'whatsapp'
     AND cs.template_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM mkt_whatsapp_templates wt
        WHERE wt.id = cs.template_id
     );

  -- 2. Per-campaign positional relink.
  FOR c IN
    SELECT cmp.id AS campaign_id, cmp.org_id, cmp.product_key
      FROM mkt_campaigns cmp
     WHERE cmp.product_key IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM mkt_campaign_steps cs
          WHERE cs.campaign_id = cmp.id
            AND cs.template_id IS NULL
            AND cs.channel IN ('email', 'whatsapp')
       )
  LOOP
    SELECT array_agg(id ORDER BY created_at)
      INTO email_tpls
      FROM mkt_email_templates
     WHERE org_id = c.org_id
       AND name ILIKE c.product_key || '-%'
       AND is_active = true;

    SELECT array_agg(id ORDER BY created_at)
      INTO wa_tpls
      FROM mkt_whatsapp_templates
     WHERE org_id = c.org_id
       AND name ILIKE c.product_key || '-%'
       AND approval_status = 'approved';

    email_idx := 1;
    wa_idx    := 1;

    FOR s IN
      SELECT id, channel, template_id
        FROM mkt_campaign_steps
       WHERE campaign_id = c.campaign_id
       ORDER BY step_number
    LOOP
      -- Steps that already point to a live template keep their link, but the
      -- corresponding positional index still advances so we don't double-bind.
      IF s.template_id IS NOT NULL THEN
        IF s.channel = 'email' THEN
          email_idx := email_idx + 1;
        ELSIF s.channel = 'whatsapp' THEN
          wa_idx := wa_idx + 1;
        END IF;
        CONTINUE;
      END IF;

      next_tpl := NULL;
      IF s.channel = 'email'
         AND email_tpls IS NOT NULL
         AND email_idx <= array_length(email_tpls, 1) THEN
        next_tpl := email_tpls[email_idx];
        email_idx := email_idx + 1;
      ELSIF s.channel = 'whatsapp'
            AND wa_tpls IS NOT NULL
            AND wa_idx <= array_length(wa_tpls, 1) THEN
        next_tpl := wa_tpls[wa_idx];
        wa_idx := wa_idx + 1;
      END IF;

      IF next_tpl IS NOT NULL THEN
        UPDATE mkt_campaign_steps
           SET template_id = next_tpl
         WHERE id = s.id;
      END IF;
    END LOOP;
  END LOOP;

  -- 3. Pull stuck enrollments forward so step 1 fires on the next executor
  --    tick. Skip the toggle-off sentinel (2099-12-31) — those should stay
  --    frozen until the user re-enables the product.
  UPDATE mkt_sequence_enrollments e
     SET next_action_at = now()
    FROM mkt_campaign_steps cs
   WHERE cs.campaign_id  = e.campaign_id
     AND cs.step_number  = e.current_step
     AND cs.is_active    = true
     AND cs.template_id IS NOT NULL
     AND e.status        = 'active'
     AND e.next_action_at > now()
     AND e.next_action_at < '2099-01-01'::timestamptz;
END $$;
