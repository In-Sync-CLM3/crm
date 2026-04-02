-- ============================================================================
-- Phase 4/5/6: Milestones, Multi-Product, Channels, Budget, Cross-sell,
--              MRR, Sync Log, Global Persona Intelligence
-- + toggle_product_active function + payment listener trigger function
-- ============================================================================


-- ============================================================================
-- PRE-REQUISITE: Add metadata column to mkt_campaigns if missing
-- (needed by toggle_product_active to filter campaigns by product_key)
-- ============================================================================
ALTER TABLE public.mkt_campaigns ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';


-- ============================================================================
-- 1. mkt_milestones — Milestone tracking (no org_id — global table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mkt_milestones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_key       text UNIQUE NOT NULL,
  milestone_name      text NOT NULL,
  trigger_condition   text NOT NULL,
  -- Human-readable description of when this milestone is reached
  trigger_sql         text NOT NULL,
  -- SQL query that returns true/false for milestone check
  unlocks             text[],
  -- Feature keys unlocked when this milestone is reached
  reached             boolean DEFAULT false,
  reached_at          timestamptz,
  notified_in_report  boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);


-- ============================================================================
-- 2. mkt_products — Product registry (multi-product support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mkt_products (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_key                 text NOT NULL,
  product_name                text NOT NULL,
  supabase_url                text,
  -- External Supabase project URL for this product
  supabase_secret_name        text,
  -- Vault secret name for the product's service role key
  schema_map                  jsonb DEFAULT '{}',
  -- Maps generic fields to product-specific table/column names
  price_starter_monthly_paise integer,
  -- Starter plan price in paise (INR)
  price_growth_monthly_paise  integer,
  -- Growth plan price in paise (INR)
  trial_days                  integer DEFAULT 14,
  aha_event                   text,
  -- Product-specific activation event name
  active                      boolean DEFAULT false,
  onboarding_status           text DEFAULT 'pending',
  -- pending | in_progress | completed | failed
  onboarding_log              text,
  onboarded_at                timestamptz,
  last_synced_at              timestamptz,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  UNIQUE(org_id, product_key)
);


-- ============================================================================
-- 3. mkt_channels — Channel registry (per-org channel config)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mkt_channels (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_key         text NOT NULL,
  -- email | whatsapp | vapi | google_ads | meta_ads | linkedin
  active              boolean DEFAULT true,
  is_paid             boolean DEFAULT false,
  cost_paise          integer DEFAULT 0,
  -- Cost per unit in paise
  requires_approval   boolean DEFAULT false,
  daily_cap           integer,
  -- Max sends/actions per day
  unlock_milestone    text,
  -- Milestone key required to unlock this channel (NULL = always available)
  created_at          timestamptz DEFAULT now(),
  UNIQUE(org_id, channel_key)
);


-- ============================================================================
-- 4. mkt_budget_allocation — Budget tracking per channel per period
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mkt_budget_allocation (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  total_budget_paise  bigint DEFAULT 0,
  channel_key         text NOT NULL,
  allocated_paise     bigint DEFAULT 0,
  spent_paise         bigint DEFAULT 0,
  roas                numeric(8,4),
  -- Return on ad spend
  allocation_rule     text,
  -- Description of how budget was allocated
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(org_id, period_start, channel_key)
);


-- ============================================================================
-- 5. mkt_crosssell_pairs — Cross-sell product pair rankings
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mkt_crosssell_pairs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_product_key  text NOT NULL,
  target_product_key  text NOT NULL,
  conversion_rate     numeric(5,4) DEFAULT 0,
  rank                integer DEFAULT 0,
  sample_size         integer DEFAULT 0,
  last_evaluated_at   timestamptz,
  created_at          timestamptz DEFAULT now(),
  UNIQUE(org_id, source_product_key, target_product_key)
);


-- ============================================================================
-- 6. mkt_mrr — Monthly Recurring Revenue tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mkt_mrr (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id          uuid REFERENCES public.contacts(id),
  lead_id             uuid REFERENCES public.mkt_leads(id),
  product_key         text,
  mrr_paise           integer NOT NULL DEFAULT 0,
  -- MRR amount in paise (INR)
  started_at          timestamptz DEFAULT now(),
  ended_at            timestamptz,
  churn_reason        text,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);


-- ============================================================================
-- 7. mkt_product_sync_log — Product data sync audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mkt_product_sync_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_key         text NOT NULL,
  sync_type           text NOT NULL,
  -- full | incremental | schema | metrics
  data_before         jsonb,
  data_after          jsonb,
  changes_detected    boolean DEFAULT false,
  synced_at           timestamptz DEFAULT now()
);


-- ============================================================================
-- 8. mkt_global_persona_intelligence — Cross-product persona learnings
--    (M4 unlock but table created now for readiness)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mkt_global_persona_intelligence (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical                    text NOT NULL,
  designation_group           text NOT NULL,
  language                    text DEFAULT 'en',
  best_send_hour_ist          integer,
  -- 0-23 IST hour
  best_send_day               text,
  -- monday | tuesday | ... | sunday
  best_subject_pattern        text,
  best_cta_pattern            text,
  best_urgency_frame          text,
  responsive_to_roi           boolean,
  responsive_to_compliance    boolean,
  responsive_to_social        boolean,
  avg_open_rate               numeric(5,4),
  avg_click_rate              numeric(5,4),
  avg_trial_rate              numeric(5,4),
  avg_payment_rate            numeric(5,4),
  sample_size                 integer DEFAULT 0,
  source_products             text[],
  -- Which products contributed data to this persona record
  updated_at                  timestamptz DEFAULT now(),
  UNIQUE(vertical, designation_group, language)
);


-- ============================================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================================
ALTER TABLE public.mkt_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_budget_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_crosssell_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_mrr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_product_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_global_persona_intelligence ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- RLS POLICIES — SERVICE ROLE (full access on all tables)
-- ============================================================================
CREATE POLICY "Service role has full access to mkt_milestones"
  ON public.mkt_milestones FOR ALL TO service_role USING (true);

CREATE POLICY "Service role has full access to mkt_products"
  ON public.mkt_products FOR ALL TO service_role USING (true);

CREATE POLICY "Service role has full access to mkt_channels"
  ON public.mkt_channels FOR ALL TO service_role USING (true);

CREATE POLICY "Service role has full access to mkt_budget_allocation"
  ON public.mkt_budget_allocation FOR ALL TO service_role USING (true);

CREATE POLICY "Service role has full access to mkt_crosssell_pairs"
  ON public.mkt_crosssell_pairs FOR ALL TO service_role USING (true);

CREATE POLICY "Service role has full access to mkt_mrr"
  ON public.mkt_mrr FOR ALL TO service_role USING (true);

CREATE POLICY "Service role has full access to mkt_product_sync_log"
  ON public.mkt_product_sync_log FOR ALL TO service_role USING (true);

CREATE POLICY "Service role has full access to mkt_global_persona_intelligence"
  ON public.mkt_global_persona_intelligence FOR ALL TO service_role USING (true);


-- ============================================================================
-- RLS POLICIES — SELECT (authenticated users)
-- ============================================================================

-- mkt_milestones: global table, all authenticated users can read
CREATE POLICY "Authenticated users can view milestones"
  ON public.mkt_milestones FOR SELECT TO authenticated USING (true);

-- Org-scoped tables: users can view their own org's data
CREATE POLICY "Users can view mkt_products in their org"
  ON public.mkt_products FOR SELECT
  USING ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can view mkt_channels in their org"
  ON public.mkt_channels FOR SELECT
  USING ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can view mkt_budget_allocation in their org"
  ON public.mkt_budget_allocation FOR SELECT
  USING ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can view mkt_crosssell_pairs in their org"
  ON public.mkt_crosssell_pairs FOR SELECT
  USING ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can view mkt_mrr in their org"
  ON public.mkt_mrr FOR SELECT
  USING ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can view mkt_product_sync_log in their org"
  ON public.mkt_product_sync_log FOR SELECT
  USING ((org_id = public.get_user_org_id(auth.uid())));

-- mkt_global_persona_intelligence: global table, all authenticated users can read
CREATE POLICY "Authenticated users can view global persona intelligence"
  ON public.mkt_global_persona_intelligence FOR SELECT TO authenticated USING (true);


-- ============================================================================
-- RLS POLICIES — INSERT (authenticated users in their org)
-- ============================================================================
CREATE POLICY "Users can insert mkt_products in their org"
  ON public.mkt_products FOR INSERT
  WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can insert mkt_channels in their org"
  ON public.mkt_channels FOR INSERT
  WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can insert mkt_budget_allocation in their org"
  ON public.mkt_budget_allocation FOR INSERT
  WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can insert mkt_crosssell_pairs in their org"
  ON public.mkt_crosssell_pairs FOR INSERT
  WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can insert mkt_mrr in their org"
  ON public.mkt_mrr FOR INSERT
  WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can insert mkt_product_sync_log in their org"
  ON public.mkt_product_sync_log FOR INSERT
  WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));


-- ============================================================================
-- RLS POLICIES — UPDATE (authenticated users in their org)
-- ============================================================================
CREATE POLICY "Users can update mkt_products in their org"
  ON public.mkt_products FOR UPDATE
  USING ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can update mkt_channels in their org"
  ON public.mkt_channels FOR UPDATE
  USING ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can update mkt_budget_allocation in their org"
  ON public.mkt_budget_allocation FOR UPDATE
  USING ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can update mkt_crosssell_pairs in their org"
  ON public.mkt_crosssell_pairs FOR UPDATE
  USING ((org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Users can update mkt_mrr in their org"
  ON public.mkt_mrr FOR UPDATE
  USING ((org_id = public.get_user_org_id(auth.uid())));


-- ============================================================================
-- INDEXES — Performance optimization
-- ============================================================================

-- mkt_milestones
CREATE INDEX IF NOT EXISTS idx_mkt_milestones_key
  ON public.mkt_milestones(milestone_key);
CREATE INDEX IF NOT EXISTS idx_mkt_milestones_reached
  ON public.mkt_milestones(reached) WHERE reached = false;

-- mkt_products
CREATE INDEX IF NOT EXISTS idx_mkt_products_org
  ON public.mkt_products(org_id);
CREATE INDEX IF NOT EXISTS idx_mkt_products_org_active
  ON public.mkt_products(org_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_mkt_products_product_key
  ON public.mkt_products(org_id, product_key);
CREATE INDEX IF NOT EXISTS idx_mkt_products_created_at
  ON public.mkt_products(created_at DESC);

-- mkt_channels
CREATE INDEX IF NOT EXISTS idx_mkt_channels_org
  ON public.mkt_channels(org_id);
CREATE INDEX IF NOT EXISTS idx_mkt_channels_org_active
  ON public.mkt_channels(org_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_mkt_channels_org_channel
  ON public.mkt_channels(org_id, channel_key);

-- mkt_budget_allocation
CREATE INDEX IF NOT EXISTS idx_mkt_budget_org
  ON public.mkt_budget_allocation(org_id);
CREATE INDEX IF NOT EXISTS idx_mkt_budget_org_period
  ON public.mkt_budget_allocation(org_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_mkt_budget_channel
  ON public.mkt_budget_allocation(org_id, channel_key);
CREATE INDEX IF NOT EXISTS idx_mkt_budget_created_at
  ON public.mkt_budget_allocation(created_at DESC);

-- mkt_crosssell_pairs
CREATE INDEX IF NOT EXISTS idx_mkt_crosssell_org
  ON public.mkt_crosssell_pairs(org_id);
CREATE INDEX IF NOT EXISTS idx_mkt_crosssell_source
  ON public.mkt_crosssell_pairs(org_id, source_product_key);
CREATE INDEX IF NOT EXISTS idx_mkt_crosssell_rank
  ON public.mkt_crosssell_pairs(org_id, rank);

-- mkt_mrr
CREATE INDEX IF NOT EXISTS idx_mkt_mrr_org
  ON public.mkt_mrr(org_id);
CREATE INDEX IF NOT EXISTS idx_mkt_mrr_contact
  ON public.mkt_mrr(contact_id);
CREATE INDEX IF NOT EXISTS idx_mkt_mrr_lead
  ON public.mkt_mrr(lead_id);
CREATE INDEX IF NOT EXISTS idx_mkt_mrr_org_active
  ON public.mkt_mrr(org_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_mkt_mrr_product
  ON public.mkt_mrr(org_id, product_key);
CREATE INDEX IF NOT EXISTS idx_mkt_mrr_created_at
  ON public.mkt_mrr(created_at DESC);

-- mkt_product_sync_log
CREATE INDEX IF NOT EXISTS idx_mkt_sync_log_org
  ON public.mkt_product_sync_log(org_id);
CREATE INDEX IF NOT EXISTS idx_mkt_sync_log_product
  ON public.mkt_product_sync_log(org_id, product_key);
CREATE INDEX IF NOT EXISTS idx_mkt_sync_log_synced_at
  ON public.mkt_product_sync_log(synced_at DESC);

-- mkt_global_persona_intelligence
CREATE INDEX IF NOT EXISTS idx_mkt_persona_vertical
  ON public.mkt_global_persona_intelligence(vertical);
CREATE INDEX IF NOT EXISTS idx_mkt_persona_designation
  ON public.mkt_global_persona_intelligence(designation_group);
CREATE INDEX IF NOT EXISTS idx_mkt_persona_lookup
  ON public.mkt_global_persona_intelligence(vertical, designation_group, language);


-- ============================================================================
-- UPDATED_AT TRIGGERS (for tables with updated_at columns)
-- ============================================================================
CREATE TRIGGER update_mkt_products_updated_at
  BEFORE UPDATE ON public.mkt_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mkt_budget_allocation_updated_at
  BEFORE UPDATE ON public.mkt_budget_allocation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mkt_global_persona_intelligence_updated_at
  BEFORE UPDATE ON public.mkt_global_persona_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- SEED: 7 milestones
-- ============================================================================
INSERT INTO public.mkt_milestones (milestone_key, milestone_name, trigger_condition, trigger_sql, unlocks)
VALUES
  ('M1', 'First Paying Client', '1 paying client',
   'SELECT COUNT(*) >= 1 FROM public.contacts WHERE status = ''customer''',
   ARRAY['basic_reporting']),

  ('M2', 'Five Clients', '5 paying clients',
   'SELECT COUNT(*) >= 5 FROM public.contacts WHERE status = ''customer''',
   ARRAY['referral_engine', 'client_roi_reports']),

  ('M3', 'Ten Clients', '10 paying clients',
   'SELECT COUNT(*) >= 10 FROM public.contacts WHERE status = ''customer''',
   ARRAY['vapi_calls', 'nps_engine']),

  ('M4', 'Twenty-Five Clients', '25 paying clients',
   'SELECT COUNT(*) >= 25 FROM public.contacts WHERE status = ''customer''',
   ARRAY['global_persona_intelligence', 'google_ads']),

  ('M5', 'Fifty Clients', '50 paying clients',
   'SELECT COUNT(*) >= 50 FROM public.contacts WHERE status = ''customer''',
   ARRAY['apollo_intent', 'meta_ads', 'login_churn_prediction']),

  ('M6', 'Hundred Clients', '100 paying clients',
   'SELECT COUNT(*) >= 100 FROM public.contacts WHERE status = ''customer''',
   ARRAY['international_expansion', 'linkedin_ads']),

  ('M7', 'Two Hundred Clients', '200 paying clients',
   'SELECT COUNT(*) >= 200 FROM public.contacts WHERE status = ''customer''',
   ARRAY['g2_buyer_intent'])
ON CONFLICT (milestone_key) DO NOTHING;


-- ============================================================================
-- SEED: Default channels for each existing org
-- ============================================================================
INSERT INTO public.mkt_channels (org_id, channel_key, active, is_paid, cost_paise, requires_approval, daily_cap, unlock_milestone)
SELECT
  o.id,
  ch.channel_key,
  ch.active,
  ch.is_paid,
  ch.cost_paise,
  ch.requires_approval,
  ch.daily_cap,
  ch.unlock_milestone
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('email',      true,  false, 0,    false, 500,  NULL),
    ('whatsapp',   true,  false, 100,  false, 200,  NULL),
    ('vapi',       false, true,  1500, false, 50,   'M3'),
    ('google_ads', false, true,  0,    false, NULL, 'M4'),
    ('meta_ads',   false, true,  0,    false, NULL, 'M5'),
    ('linkedin',   false, true,  0,    false, NULL, 'M6')
) AS ch(channel_key, active, is_paid, cost_paise, requires_approval, daily_cap, unlock_milestone)
ON CONFLICT (org_id, channel_key) DO NOTHING;


-- ============================================================================
-- FUNCTION: toggle_product_active
-- Activates/deactivates a product and cascades to campaigns & enrollments
-- ============================================================================
CREATE OR REPLACE FUNCTION public.toggle_product_active(
  _product_id uuid,
  _active boolean
) RETURNS void AS $$
BEGIN
  -- Update product status
  UPDATE public.mkt_products
  SET active = _active, updated_at = now()
  WHERE id = _product_id;

  IF NOT _active THEN
    -- Deactivating: pause all active campaigns for this product
    UPDATE public.mkt_campaigns
    SET status = 'paused', updated_at = now()
    WHERE org_id = (SELECT org_id FROM public.mkt_products WHERE id = _product_id)
      AND metadata->>'product_key' = (SELECT product_key FROM public.mkt_products WHERE id = _product_id)
      AND status = 'active';

    -- Pause all active enrollments for those campaigns
    UPDATE public.mkt_sequence_enrollments
    SET status = 'paused', updated_at = now()
    WHERE campaign_id IN (
      SELECT id FROM public.mkt_campaigns
      WHERE org_id = (SELECT org_id FROM public.mkt_products WHERE id = _product_id)
        AND metadata->>'product_key' = (SELECT product_key FROM public.mkt_products WHERE id = _product_id)
    )
    AND status = 'active';

  ELSE
    -- Activating: resume paused campaigns for this product
    UPDATE public.mkt_campaigns
    SET status = 'active', updated_at = now()
    WHERE org_id = (SELECT org_id FROM public.mkt_products WHERE id = _product_id)
      AND metadata->>'product_key' = (SELECT product_key FROM public.mkt_products WHERE id = _product_id)
      AND status = 'paused';

    -- Resume paused enrollments, recalculating next_action_at from current step delay
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
      WHERE org_id = (SELECT org_id FROM public.mkt_products WHERE id = _product_id)
        AND metadata->>'product_key' = (SELECT product_key FROM public.mkt_products WHERE id = _product_id)
    )
    AND status = 'paused';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- FUNCTION: mkt_payment_listener
-- Trigger function that fires on payment confirmation to convert leads,
-- cancel enrollments, and create MRR records
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mkt_payment_listener() RETURNS trigger AS $$
DECLARE
  _lead record;
  _org_id uuid;
BEGIN
  -- Only fire on payment confirmation (status = 'paid' or 'completed' or 'success')
  IF NEW.status IN ('paid', 'completed', 'success') AND
     (OLD IS NULL OR OLD.status NOT IN ('paid', 'completed', 'success')) THEN

    _org_id := NEW.org_id;

    -- Find matching lead by email or contact_id that hasn't already converted
    SELECT * INTO _lead FROM public.mkt_leads
    WHERE org_id = _org_id
      AND (email = NEW.email OR contact_id = NEW.contact_id)
      AND status != 'converted'
    LIMIT 1;

    IF _lead IS NOT NULL THEN
      -- Mark lead as converted
      UPDATE public.mkt_leads
      SET status = 'converted',
          converted_at = now(),
          updated_at = now()
      WHERE id = _lead.id;

      -- Cancel all active/paused enrollments for this lead
      UPDATE public.mkt_sequence_enrollments
      SET status = 'completed',
          completed_at = now(),
          updated_at = now()
      WHERE lead_id = _lead.id
        AND status IN ('active', 'paused');

      -- Create MRR record
      INSERT INTO public.mkt_mrr (org_id, contact_id, lead_id, product_key, mrr_paise)
      VALUES (_org_id, NEW.contact_id, _lead.id, NEW.product_key, COALESCE(NEW.amount_paise, 0));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTE: The trigger attachment depends on the payments table name.
-- It will be attached when the payments table is identified:
-- CREATE TRIGGER mkt_payment_trigger
--   AFTER INSERT OR UPDATE ON public.payments
--   FOR EACH ROW EXECUTE FUNCTION public.mkt_payment_listener();
