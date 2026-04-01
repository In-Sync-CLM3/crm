-- ============================================================================
-- Gap fixes: 3 missing tables, call_scripts ALTER, engine config seed
-- ============================================================================

-- 1. ALTER mkt_call_scripts: add product_key and call_type for per-product script selection
ALTER TABLE public.mkt_call_scripts ADD COLUMN IF NOT EXISTS product_key text;
ALTER TABLE public.mkt_call_scripts ADD COLUMN IF NOT EXISTS call_type text DEFAULT 'intro';
  -- call_type values: intro | follow_up | demo | closing | reactivation
CREATE INDEX IF NOT EXISTS idx_mkt_call_scripts_lookup
  ON public.mkt_call_scripts(org_id, product_key, call_type) WHERE is_active = true;

-- 2. mkt_vapi_calls — dedicated call log table
CREATE TABLE public.mkt_vapi_calls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id             uuid REFERENCES public.mkt_leads(id),
  action_id           uuid REFERENCES public.mkt_sequence_actions(id),
  vapi_call_id        text,
  phone_number        text,
  status              text DEFAULT 'initiated',
    -- initiated | in_progress | completed | failed | no_answer | voicemail
  outcome             text,
    -- engaged | answered | voicemail | no_answer | failed
  duration_seconds    integer DEFAULT 0,
  transcript          text,
  transcript_url      text,
  summary             text,
  ended_reason        text,
  cost                numeric(10,4) DEFAULT 0,
  callback_requested  boolean DEFAULT false,
  callback_time       timestamptz,
  insights            jsonb,
  script_id           uuid REFERENCES public.mkt_call_scripts(id),
  voice_id            text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.mkt_vapi_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own org calls" ON public.mkt_vapi_calls
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can insert own org calls" ON public.mkt_vapi_calls
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can update own org calls" ON public.mkt_vapi_calls
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX idx_mkt_vapi_calls_lead ON public.mkt_vapi_calls(lead_id, created_at DESC);
CREATE INDEX idx_mkt_vapi_calls_status ON public.mkt_vapi_calls(org_id, status, created_at DESC);

-- 3. mkt_exit_surveys — exit survey responses from dead leads
CREATE TABLE public.mkt_exit_surveys (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id             uuid REFERENCES public.mkt_leads(id),
  contact_id          uuid REFERENCES public.contacts(id),
  channel             text DEFAULT 'whatsapp',
    -- whatsapp | email
  sent_at             timestamptz,
  responded_at        timestamptz,
  response_text       text,
  exit_reason         text,
    -- pricing | no_need | competitor | bad_experience | other
  would_return        boolean,
  nps_score           integer,
    -- 0-10
  signals_extracted   boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.mkt_exit_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own org surveys" ON public.mkt_exit_surveys
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can insert own org surveys" ON public.mkt_exit_surveys
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can update own org surveys" ON public.mkt_exit_surveys
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX idx_mkt_exit_surveys_lead ON public.mkt_exit_surveys(lead_id, created_at DESC);
CREATE INDEX idx_mkt_exit_surveys_pending ON public.mkt_exit_surveys(org_id, responded_at)
  WHERE responded_at IS NULL;

-- 4. mkt_client_outcomes — monthly ROI reports for paying clients
CREATE TABLE public.mkt_client_outcomes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id          uuid REFERENCES public.contacts(id),
  report_month        date NOT NULL,
  leads_sourced       integer DEFAULT 0,
  leads_qualified     integer DEFAULT 0,
  meetings_booked     integer DEFAULT 0,
  deals_won           integer DEFAULT 0,
  revenue_generated   integer DEFAULT 0,   -- paise
  emails_sent         integer DEFAULT 0,
  emails_opened       integer DEFAULT 0,
  whatsapp_sent       integer DEFAULT 0,
  whatsapp_replied    integer DEFAULT 0,
  calls_made          integer DEFAULT 0,
  calls_engaged       integer DEFAULT 0,
  roi_pct             numeric(8,2),
  narrative           text,                -- LLM-generated summary
  emailed_at          timestamptz,
  email_opened_at     timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.mkt_client_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own org outcomes" ON public.mkt_client_outcomes
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can insert own org outcomes" ON public.mkt_client_outcomes
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can update own org outcomes" ON public.mkt_client_outcomes
  FOR UPDATE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX idx_mkt_client_outcomes_contact ON public.mkt_client_outcomes(contact_id, report_month DESC);
CREATE INDEX idx_mkt_client_outcomes_month ON public.mkt_client_outcomes(org_id, report_month DESC);

-- 5. updated_at triggers for new tables
CREATE TRIGGER set_updated_at_mkt_vapi_calls BEFORE UPDATE ON public.mkt_vapi_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_mkt_exit_surveys BEFORE UPDATE ON public.mkt_exit_surveys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_mkt_client_outcomes BEFORE UPDATE ON public.mkt_client_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6. Seed mkt_engine_config for all existing organizations
-- ============================================================================
DO $$
DECLARE
  _org_id uuid;
BEGIN
  FOR _org_id IN SELECT id FROM public.organizations LOOP

    -- Scoring weights (fit 40, intent 30, engagement 30)
    INSERT INTO public.mkt_engine_config (org_id, config_key, config_value, description)
    VALUES (_org_id, 'scoring_weights',
            '{"fit": 40, "intent": 30, "engagement": 30}'::jsonb,
            'Lead scoring dimension weights (must sum to 100)')
    ON CONFLICT (org_id, config_key) DO NOTHING;

    -- Score thresholds
    INSERT INTO public.mkt_engine_config (org_id, config_key, config_value, description)
    VALUES (_org_id, 'score_thresholds',
            '{"enrollment_min": 40, "conversion_min": 70, "disqualify_below": 15}'::jsonb,
            'Score thresholds for auto-enrollment, conversion, and disqualification')
    ON CONFLICT (org_id, config_key) DO NOTHING;

    -- Channel daily limits
    INSERT INTO public.mkt_engine_config (org_id, config_key, config_value, description)
    VALUES (_org_id, 'channel_limits',
            '{"email_per_day": 500, "whatsapp_per_day": 200, "call_per_day": 50, "sms_per_day": 100}'::jsonb,
            'Maximum sends per channel per day')
    ON CONFLICT (org_id, config_key) DO NOTHING;

    -- Rate limits for external APIs
    INSERT INTO public.mkt_engine_config (org_id, config_key, config_value, description)
    VALUES (_org_id, 'rate_limits',
            '{"apollo_per_hour": 400, "resend_per_second": 10, "exotel_per_day": 1000}'::jsonb,
            'External API rate limits')
    ON CONFLICT (org_id, config_key) DO NOTHING;

    -- Infrastructure cost (Rs 61,000/month = 6,100,000 paise)
    INSERT INTO public.mkt_engine_config (org_id, config_key, config_value, description)
    VALUES (_org_id, 'cost_infrastructure',
            '{"monthly_paise": 6100000}'::jsonb,
            'Monthly infrastructure cost in paise for margin calculations')
    ON CONFLICT (org_id, config_key) DO NOTHING;

    -- LLM token budgets
    INSERT INTO public.mkt_engine_config (org_id, config_key, config_value, description)
    VALUES (_org_id, 'llm_token_budget',
            '{"daily_haiku_tokens": 500000, "daily_sonnet_tokens": 100000, "alert_threshold_pct": 80}'::jsonb,
            'Daily LLM token budgets and alert threshold')
    ON CONFLICT (org_id, config_key) DO NOTHING;

    -- Sequence executor settings
    INSERT INTO public.mkt_engine_config (org_id, config_key, config_value, description)
    VALUES (_org_id, 'sequence_settings',
            '{"batch_size": 50, "parallel_batch_size": 10, "max_enrollments_per_campaign": 5000, "max_actions_per_day": 1000}'::jsonb,
            'Sequence executor batch sizes and campaign limits')
    ON CONFLICT (org_id, config_key) DO NOTHING;

    -- Apollo sourcer settings
    INSERT INTO public.mkt_engine_config (org_id, config_key, config_value, description)
    VALUES (_org_id, 'apollo_settings',
            '{"max_results_per_search": 100, "dedup_window_days": 90, "min_enrichment_fields": 3}'::jsonb,
            'Apollo lead sourcing configuration')
    ON CONFLICT (org_id, config_key) DO NOTHING;

    -- Breakpoint thresholds (reference copy of hardcoded values in mkt-breakpoint-monitor)
    INSERT INTO public.mkt_engine_config (org_id, config_key, config_value, description)
    VALUES (_org_id, 'breakpoint_thresholds',
            '{"mrr_growth_stall_pct": 10, "revenue_decline_pct": 15, "cac_ceiling_paise": 1200000, "gross_margin_floor_pct": 60, "trial_to_paid_floor_pct": 5, "aha_to_paid_floor_pct": 35, "monthly_churn_ceiling_pct": 8, "email_bounce_ceiling_pct": 5, "wa_optout_ceiling_pct": 2, "llm_daily_token_ceiling": 250000, "dnc_complaint_ceiling_7d": 5}'::jsonb,
            'Breakpoint threshold values (reference — currently hardcoded in monitor)')
    ON CONFLICT (org_id, config_key) DO NOTHING;

    -- Google Ads accounts (empty placeholder)
    INSERT INTO public.mkt_engine_config (org_id, config_key, config_value, description)
    VALUES (_org_id, 'google_ads_accounts',
            '{"customer_ids": []}'::jsonb,
            'Google Ads customer IDs for sync')
    ON CONFLICT (org_id, config_key) DO NOTHING;

  END LOOP;
END $$;
