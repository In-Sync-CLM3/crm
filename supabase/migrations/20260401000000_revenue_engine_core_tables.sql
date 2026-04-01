-- ============================================================================
-- Revenue Engine: Core Tables Migration
-- 27 mkt_* tables + RLS policies + updated_at triggers
-- ============================================================================

-- ============================================================================
-- 1. mkt_campaigns — Campaign definitions
-- ============================================================================
CREATE TABLE public.mkt_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  campaign_type   text NOT NULL DEFAULT 'outbound',
  -- outbound | inbound | nurture | reactivation | event
  status          text NOT NULL DEFAULT 'draft',
  -- draft | active | paused | completed | archived
  icp_criteria    jsonb DEFAULT '{}',
  -- Dynamic ICP definition: {industry, company_size, role, geography, custom_filters}
  budget          numeric(12,2),
  budget_spent    numeric(12,2) DEFAULT 0,
  currency        text DEFAULT 'INR',
  start_date      date,
  end_date        date,
  max_enrollments integer DEFAULT 1000,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 2. mkt_campaign_steps — Multi-step sequence definitions
-- ============================================================================
CREATE TABLE public.mkt_campaign_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES public.mkt_campaigns(id) ON DELETE CASCADE,
  step_number     integer NOT NULL,
  channel         text NOT NULL,
  -- email | whatsapp | call | sms
  delay_hours     integer NOT NULL DEFAULT 0,
  -- Hours to wait after previous step
  template_id     uuid,
  -- References mkt_email_templates, mkt_whatsapp_templates, or mkt_call_scripts
  template_type   text,
  -- email | whatsapp | call_script
  conditions      jsonb DEFAULT '{}',
  -- e.g. {"require_previous_opened": true, "skip_if_replied": true}
  ab_test_id      uuid,
  -- If set, this step runs an A/B test
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(campaign_id, step_number)
);

-- ============================================================================
-- 3. mkt_leads — Sourced leads before CRM contact conversion
-- ============================================================================
CREATE TABLE public.mkt_leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES public.contacts(id),
  -- Nullable: set when lead converts to contact
  campaign_id     uuid REFERENCES public.mkt_campaigns(id),
  -- Campaign that sourced this lead
  source          text NOT NULL DEFAULT 'apollo',
  -- apollo | google_ads | indiamart | manual | import | website
  status          text NOT NULL DEFAULT 'new',
  -- new | enriched | scored | enrolled | converted | disqualified
  -- Basic info
  first_name      text,
  last_name       text,
  email           text,
  phone           text,
  company         text,
  job_title       text,
  industry        text,
  company_size    text,
  city            text,
  state           text,
  country         text DEFAULT 'India',
  linkedin_url    text,
  website         text,
  -- Enrichment data from Apollo or other sources
  enrichment_data jsonb DEFAULT '{}',
  -- Scoring
  fit_score       integer DEFAULT 0,
  intent_score    integer DEFAULT 0,
  engagement_score integer DEFAULT 0,
  total_score     integer DEFAULT 0,
  scored_at       timestamptz,
  -- Google Ads attribution
  ga_client_id    text,
  -- GA4 client_id captured from website cookie
  gclid           text,
  -- Google Click ID from ad traffic
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_term        text,
  utm_content     text,
  -- Lifecycle
  enrolled_at     timestamptz,
  converted_at    timestamptz,
  disqualified_at timestamptz,
  disqualified_reason text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 4. mkt_lead_scores — Composite scoring per lead
-- ============================================================================
CREATE TABLE public.mkt_lead_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES public.mkt_leads(id) ON DELETE CASCADE,
  fit_score       integer DEFAULT 0,
  intent_score    integer DEFAULT 0,
  engagement_score integer DEFAULT 0,
  total_score     integer DEFAULT 0,
  scoring_model   text DEFAULT 'v1',
  scoring_details jsonb DEFAULT '{}',
  -- {fit_reasons: [], intent_signals: [], engagement_events: []}
  scored_at       timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(lead_id)
);

-- ============================================================================
-- 5. mkt_lead_score_history — Score change audit trail
-- ============================================================================
CREATE TABLE public.mkt_lead_score_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES public.mkt_leads(id) ON DELETE CASCADE,
  previous_total  integer,
  new_total       integer,
  fit_delta       integer DEFAULT 0,
  intent_delta    integer DEFAULT 0,
  engagement_delta integer DEFAULT 0,
  reason          text,
  triggered_by    text,
  -- scorer | email_open | email_click | whatsapp_reply | call_outcome | manual
  created_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 6. mkt_sequence_enrollments — Lead enrollment in campaign sequences
-- ============================================================================
CREATE TABLE public.mkt_sequence_enrollments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES public.mkt_leads(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES public.mkt_campaigns(id) ON DELETE CASCADE,
  current_step    integer NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'active',
  -- active | paused | completed | cancelled | bounced
  next_action_at  timestamptz,
  -- When the next step should execute (indexed for scheduler)
  enrolled_at     timestamptz DEFAULT now(),
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 7. mkt_sequence_actions — Executed actions log
-- ============================================================================
CREATE TABLE public.mkt_sequence_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enrollment_id   uuid NOT NULL REFERENCES public.mkt_sequence_enrollments(id) ON DELETE CASCADE,
  step_id         uuid REFERENCES public.mkt_campaign_steps(id),
  step_number     integer NOT NULL,
  channel         text NOT NULL,
  -- email | whatsapp | call | sms
  status          text NOT NULL DEFAULT 'pending',
  -- pending | sent | delivered | failed | bounced | skipped
  variant         text,
  -- A/B test variant identifier (A, B, etc.)
  -- Timestamps
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  opened_at       timestamptz,
  clicked_at      timestamptz,
  replied_at      timestamptz,
  failed_at       timestamptz,
  failure_reason  text,
  -- Channel-specific IDs
  external_id     text,
  -- Resend message ID, Exotel call SID, etc.
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 8. mkt_email_templates — Marketing email templates with A/B variants
-- ============================================================================
CREATE TABLE public.mkt_email_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  subject         text NOT NULL,
  body_html       text NOT NULL,
  body_text       text,
  from_name       text,
  reply_to        text,
  category        text DEFAULT 'outreach',
  -- outreach | follow_up | nurture | re_engagement | announcement
  variant_of      uuid REFERENCES public.mkt_email_templates(id),
  -- If set, this is an A/B variant of another template
  variant_label   text,
  -- A, B, C, etc.
  variables       jsonb DEFAULT '[]',
  -- List of template variables used
  is_active       boolean DEFAULT true,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 9. mkt_whatsapp_templates — WhatsApp message templates
-- ============================================================================
CREATE TABLE public.mkt_whatsapp_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  template_name   text NOT NULL,
  -- Pre-approved template name from Exotel
  language        text DEFAULT 'en',
  body            text NOT NULL,
  header          text,
  footer          text,
  buttons         jsonb DEFAULT '[]',
  variables       jsonb DEFAULT '[]',
  category        text DEFAULT 'marketing',
  -- marketing | utility | authentication
  approval_status text DEFAULT 'pending',
  -- pending | approved | rejected
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 10. mkt_call_scripts — AI call scripts with objection handling
-- ============================================================================
CREATE TABLE public.mkt_call_scripts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  objective       text NOT NULL,
  -- e.g. "Book a demo", "Qualify interest", "Follow up on trial"
  opening         text NOT NULL,
  key_points      jsonb DEFAULT '[]',
  -- Array of talking points
  objection_handling jsonb DEFAULT '{}',
  -- {objection_type: response_script}
  closing         text,
  voice_id        text,
  -- ElevenLabs voice ID
  language        text DEFAULT 'en',
  max_duration_seconds integer DEFAULT 300,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 11. mkt_conversation_memory — Unified cross-channel conversation context
-- ============================================================================
CREATE TABLE public.mkt_conversation_memory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES public.mkt_leads(id) ON DELETE CASCADE,
  context         jsonb NOT NULL DEFAULT '{}',
  -- Flexible cross-channel storage:
  -- {timeline: [{channel, direction, summary, timestamp}],
  --  key_facts: [], objections: [], interests: [], next_steps: []}
  token_count     integer DEFAULT 0,
  last_channel    text,
  last_interaction_at timestamptz,
  summary_count   integer DEFAULT 0,
  -- Number of times context has been summarised
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(lead_id)
);

-- ============================================================================
-- 12. mkt_ab_tests — A/B test definitions
-- ============================================================================
CREATE TABLE public.mkt_ab_tests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES public.mkt_campaigns(id) ON DELETE CASCADE,
  step_id         uuid REFERENCES public.mkt_campaign_steps(id),
  name            text NOT NULL,
  variants        jsonb NOT NULL DEFAULT '[]',
  -- [{id: "A", template_id: "...", weight: 50}, {id: "B", template_id: "...", weight: 50}]
  metric          text NOT NULL DEFAULT 'click_rate',
  -- open_rate | click_rate | reply_rate | conversion_rate
  status          text NOT NULL DEFAULT 'active',
  -- active | paused | completed
  winner          text,
  -- Winning variant ID (A, B, etc.)
  confidence      numeric(5,4),
  -- Statistical confidence level (e.g., 0.9500)
  min_samples     integer DEFAULT 100,
  -- Minimum samples per variant before evaluation
  analysis        text,
  -- LLM-generated analysis of why the winner worked
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 13. mkt_ab_test_results — Per-variant metrics
-- ============================================================================
CREATE TABLE public.mkt_ab_test_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ab_test_id      uuid NOT NULL REFERENCES public.mkt_ab_tests(id) ON DELETE CASCADE,
  variant         text NOT NULL,
  -- A, B, C, etc.
  sends           integer DEFAULT 0,
  opens           integer DEFAULT 0,
  clicks          integer DEFAULT 0,
  replies         integer DEFAULT 0,
  conversions     integer DEFAULT 0,
  open_rate       numeric(5,4) DEFAULT 0,
  click_rate      numeric(5,4) DEFAULT 0,
  reply_rate      numeric(5,4) DEFAULT 0,
  conversion_rate numeric(5,4) DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(ab_test_id, variant)
);

-- ============================================================================
-- 14. mkt_google_ads_campaigns — Google Ads campaign sync
-- ============================================================================
CREATE TABLE public.mkt_google_ads_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  google_campaign_id text NOT NULL,
  account_id      text NOT NULL,
  name            text,
  status          text,
  -- ENABLED | PAUSED | REMOVED
  campaign_type   text,
  budget_amount   numeric(12,2),
  budget_currency text DEFAULT 'INR',
  -- Metrics (synced daily)
  impressions     bigint DEFAULT 0,
  clicks          bigint DEFAULT 0,
  cost            numeric(12,2) DEFAULT 0,
  conversions     numeric(10,2) DEFAULT 0,
  conversion_value numeric(12,2) DEFAULT 0,
  ctr             numeric(8,4) DEFAULT 0,
  avg_cpc         numeric(8,2) DEFAULT 0,
  metrics_date    date,
  last_synced_at  timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(org_id, google_campaign_id)
);

-- ============================================================================
-- 15. mkt_google_ads_keywords — Keyword performance tracking
-- ============================================================================
CREATE TABLE public.mkt_google_ads_keywords (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id     uuid REFERENCES public.mkt_google_ads_campaigns(id) ON DELETE CASCADE,
  keyword         text NOT NULL,
  match_type      text,
  -- BROAD | PHRASE | EXACT
  status          text,
  -- ENABLED | PAUSED | REMOVED
  impressions     bigint DEFAULT 0,
  clicks          bigint DEFAULT 0,
  cost            numeric(12,2) DEFAULT 0,
  conversions     numeric(10,2) DEFAULT 0,
  quality_score   integer,
  avg_position    numeric(4,1),
  metrics_date    date,
  last_synced_at  timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 16. mkt_google_ads_feedback — GA4 conversion feedback for bid optimization
-- ============================================================================
CREATE TABLE public.mkt_google_ads_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.mkt_leads(id),
  gclid           text,
  ga_client_id    text,
  conversion_type text NOT NULL,
  -- lead_qualified | demo_booked | payment_received
  conversion_value numeric(12,2),
  conversion_at   timestamptz NOT NULL,
  pushed_to_ga4   boolean DEFAULT false,
  pushed_at       timestamptz,
  push_error      text,
  created_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 17. mkt_apollo_searches — Apollo search history and result caching
-- ============================================================================
CREATE TABLE public.mkt_apollo_searches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id     uuid REFERENCES public.mkt_campaigns(id),
  search_params   jsonb NOT NULL,
  -- Apollo People Search API parameters used
  results_count   integer DEFAULT 0,
  new_leads_count integer DEFAULT 0,
  duplicates_count integer DEFAULT 0,
  api_credits_used integer DEFAULT 0,
  status          text DEFAULT 'completed',
  -- completed | failed | partial
  error           text,
  created_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 18. mkt_channel_metrics — Aggregated per-channel performance
-- ============================================================================
CREATE TABLE public.mkt_channel_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id     uuid REFERENCES public.mkt_campaigns(id),
  channel         text NOT NULL,
  -- email | whatsapp | call | sms
  metric_date     date NOT NULL,
  sends           integer DEFAULT 0,
  deliveries      integer DEFAULT 0,
  opens           integer DEFAULT 0,
  clicks          integer DEFAULT 0,
  replies         integer DEFAULT 0,
  conversions     integer DEFAULT 0,
  bounces         integer DEFAULT 0,
  unsubscribes    integer DEFAULT 0,
  cost            numeric(12,2) DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(org_id, campaign_id, channel, metric_date)
);

-- ============================================================================
-- 19. mkt_daily_digests — Daily performance digest snapshots
-- ============================================================================
CREATE TABLE public.mkt_daily_digests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  digest_date     date NOT NULL,
  metrics         jsonb NOT NULL DEFAULT '{}',
  -- {campaigns_active, leads_sourced, leads_scored, emails_sent, ...}
  narrative       text,
  -- LLM-generated narrative summary
  recommendations jsonb DEFAULT '[]',
  -- Array of optimizer recommendations
  emailed_to      text[],
  emailed_at      timestamptz,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(org_id, digest_date)
);

-- ============================================================================
-- 20. mkt_engine_config — Runtime configuration (key-value)
-- ============================================================================
CREATE TABLE public.mkt_engine_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  config_key      text NOT NULL,
  config_value    jsonb NOT NULL,
  description     text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(org_id, config_key)
);

-- ============================================================================
-- 21. mkt_engine_logs — Engine execution audit log
-- ============================================================================
CREATE TABLE public.mkt_engine_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES public.organizations(id),
  function_name   text NOT NULL,
  action          text NOT NULL,
  level           text NOT NULL DEFAULT 'info',
  -- info | warn | error
  details         jsonb DEFAULT '{}',
  error           text,
  duration_ms     integer,
  tokens_used     integer,
  created_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 22. mkt_unsubscribes — Opt-out tracking for compliance
-- ============================================================================
CREATE TABLE public.mkt_unsubscribes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.mkt_leads(id),
  email           text,
  phone           text,
  channel         text NOT NULL,
  -- email | whatsapp | sms | call | all
  reason          text,
  unsubscribed_at timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  UNIQUE(org_id, email, channel)
);

-- ============================================================================
-- 23. mkt_feature_signals — Customer Expression Log (Addendum)
-- ============================================================================
CREATE TABLE public.mkt_feature_signals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id             uuid REFERENCES public.mkt_leads(id),
  product_key         text NOT NULL,
  signal_text         text NOT NULL,
  signal_category     text,
  -- feature-request | workflow-complaint | integration-request
  -- performance-issue | pricing-feedback | ux-friction | other
  is_monetisable      boolean,
  vertical            text,
  designation_group   text,
  source_channel      text,
  -- email-reply | vapi-transcript | nps-response | exit-survey | onboarding-reply
  frequency_count     integer DEFAULT 1,
  first_seen_at       timestamptz DEFAULT now(),
  last_seen_at        timestamptz DEFAULT now(),
  surfaced_in_report  boolean DEFAULT false,
  your_decision       text,
  decision_at         timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ============================================================================
-- 24. mkt_product_decisions — Your Decision Record (Addendum)
-- ============================================================================
CREATE TABLE public.mkt_product_decisions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_date         date,
  product_key         text,
  engine_question     text NOT NULL,
  your_response       text,
  decision_type       text,
  -- investigate | build | wont-build | defer | needs-more-data | acknowledged
  classified_by       text DEFAULT 'sonnet',
  feature_signal_ids  uuid[],
  actioned            boolean DEFAULT false,
  action_description  text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ============================================================================
-- 25. mkt_dropoff_snapshots — Weekly Drop-off Data (Addendum)
-- ============================================================================
CREATE TABLE public.mkt_dropoff_snapshots (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_date           date NOT NULL,
  product_key             text NOT NULL,
  landing_page_visitors   integer,
  trial_signups           integer,
  landing_to_trial_pct    numeric(5,2),
  trials_started          integer,
  aha_moments_reached     integer,
  trial_to_aha_pct        numeric(5,2),
  aha_reached             integer,
  payments_received       integer,
  aha_to_payment_pct      numeric(5,2),
  clients_at_day30        integer,
  satisfied_at_day30      integer,
  retention_30_pct        numeric(5,2),
  feature_usage           jsonb,
  created_at              timestamptz DEFAULT now(),
  UNIQUE(org_id, snapshot_date, product_key)
);

-- ============================================================================
-- 26. mkt_activation_events — Product activation tracking (Gap)
-- ============================================================================
CREATE TABLE public.mkt_activation_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.mkt_leads(id),
  product_key     text NOT NULL,
  event_type      text NOT NULL,
  -- trial_started | aha_moment | feature_used | onboarding_completed | payment_attempted
  event_data      jsonb DEFAULT '{}',
  -- {feature_name, time_to_event_hours, session_count, ...}
  occurred_at     timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 27. mkt_nps_responses — NPS survey responses (Gap)
-- ============================================================================
CREATE TABLE public.mkt_nps_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.mkt_leads(id),
  contact_id      uuid REFERENCES public.contacts(id),
  product_key     text NOT NULL,
  score           integer NOT NULL CHECK (score >= 0 AND score <= 10),
  response_text   text,
  -- Free-text feedback (fed to feature-signal-extractor)
  category        text,
  -- promoter (9-10) | passive (7-8) | detractor (0-6)
  survey_type     text DEFAULT 'standard',
  -- standard | onboarding | exit | feature
  is_at_risk      boolean DEFAULT false,
  -- Flagged by nps-engine for follow-up
  signals_extracted boolean DEFAULT false,
  -- True after feature-signal-extractor has processed
  responded_at    timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);


-- ============================================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================================
ALTER TABLE public.mkt_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_lead_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_sequence_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_call_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_ab_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_google_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_google_ads_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_google_ads_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_apollo_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_channel_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_daily_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_engine_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_engine_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_unsubscribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_feature_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_product_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_dropoff_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_activation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_nps_responses ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- RLS POLICIES — SELECT (all authenticated users in their org)
-- ============================================================================
CREATE POLICY "Users can view mkt_campaigns in their org" ON public.mkt_campaigns FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_campaign_steps in their org" ON public.mkt_campaign_steps FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_leads in their org" ON public.mkt_leads FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_lead_scores in their org" ON public.mkt_lead_scores FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_lead_score_history in their org" ON public.mkt_lead_score_history FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_sequence_enrollments in their org" ON public.mkt_sequence_enrollments FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_sequence_actions in their org" ON public.mkt_sequence_actions FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_email_templates in their org" ON public.mkt_email_templates FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_whatsapp_templates in their org" ON public.mkt_whatsapp_templates FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_call_scripts in their org" ON public.mkt_call_scripts FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_conversation_memory in their org" ON public.mkt_conversation_memory FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_ab_tests in their org" ON public.mkt_ab_tests FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_ab_test_results in their org" ON public.mkt_ab_test_results FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_google_ads_campaigns in their org" ON public.mkt_google_ads_campaigns FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_google_ads_keywords in their org" ON public.mkt_google_ads_keywords FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_google_ads_feedback in their org" ON public.mkt_google_ads_feedback FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_apollo_searches in their org" ON public.mkt_apollo_searches FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_channel_metrics in their org" ON public.mkt_channel_metrics FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_daily_digests in their org" ON public.mkt_daily_digests FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_engine_config in their org" ON public.mkt_engine_config FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_engine_logs in their org" ON public.mkt_engine_logs FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_unsubscribes in their org" ON public.mkt_unsubscribes FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_feature_signals in their org" ON public.mkt_feature_signals FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_product_decisions in their org" ON public.mkt_product_decisions FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_dropoff_snapshots in their org" ON public.mkt_dropoff_snapshots FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_activation_events in their org" ON public.mkt_activation_events FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can view mkt_nps_responses in their org" ON public.mkt_nps_responses FOR SELECT USING ((org_id = public.get_user_org_id(auth.uid())));

-- ============================================================================
-- RLS POLICIES — INSERT (authenticated users in their org)
-- ============================================================================
CREATE POLICY "Users can insert mkt_campaigns in their org" ON public.mkt_campaigns FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_campaign_steps in their org" ON public.mkt_campaign_steps FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_leads in their org" ON public.mkt_leads FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_lead_scores in their org" ON public.mkt_lead_scores FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_lead_score_history in their org" ON public.mkt_lead_score_history FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_sequence_enrollments in their org" ON public.mkt_sequence_enrollments FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_sequence_actions in their org" ON public.mkt_sequence_actions FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_email_templates in their org" ON public.mkt_email_templates FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_whatsapp_templates in their org" ON public.mkt_whatsapp_templates FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_call_scripts in their org" ON public.mkt_call_scripts FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_conversation_memory in their org" ON public.mkt_conversation_memory FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_ab_tests in their org" ON public.mkt_ab_tests FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_ab_test_results in their org" ON public.mkt_ab_test_results FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_google_ads_campaigns in their org" ON public.mkt_google_ads_campaigns FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_google_ads_keywords in their org" ON public.mkt_google_ads_keywords FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_google_ads_feedback in their org" ON public.mkt_google_ads_feedback FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_apollo_searches in their org" ON public.mkt_apollo_searches FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_channel_metrics in their org" ON public.mkt_channel_metrics FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_daily_digests in their org" ON public.mkt_daily_digests FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_engine_config in their org" ON public.mkt_engine_config FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_engine_logs in their org" ON public.mkt_engine_logs FOR INSERT WITH CHECK ((org_id IS NULL OR org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_unsubscribes in their org" ON public.mkt_unsubscribes FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_feature_signals in their org" ON public.mkt_feature_signals FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_product_decisions in their org" ON public.mkt_product_decisions FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_dropoff_snapshots in their org" ON public.mkt_dropoff_snapshots FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_activation_events in their org" ON public.mkt_activation_events FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert mkt_nps_responses in their org" ON public.mkt_nps_responses FOR INSERT WITH CHECK ((org_id = public.get_user_org_id(auth.uid())));

-- ============================================================================
-- RLS POLICIES — UPDATE (authenticated users in their org)
-- ============================================================================
CREATE POLICY "Users can update mkt_campaigns in their org" ON public.mkt_campaigns FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_campaign_steps in their org" ON public.mkt_campaign_steps FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_leads in their org" ON public.mkt_leads FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_lead_scores in their org" ON public.mkt_lead_scores FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_sequence_enrollments in their org" ON public.mkt_sequence_enrollments FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_sequence_actions in their org" ON public.mkt_sequence_actions FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_email_templates in their org" ON public.mkt_email_templates FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_whatsapp_templates in their org" ON public.mkt_whatsapp_templates FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_call_scripts in their org" ON public.mkt_call_scripts FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_conversation_memory in their org" ON public.mkt_conversation_memory FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_ab_tests in their org" ON public.mkt_ab_tests FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_ab_test_results in their org" ON public.mkt_ab_test_results FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_google_ads_campaigns in their org" ON public.mkt_google_ads_campaigns FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_google_ads_keywords in their org" ON public.mkt_google_ads_keywords FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_google_ads_feedback in their org" ON public.mkt_google_ads_feedback FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_channel_metrics in their org" ON public.mkt_channel_metrics FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_engine_config in their org" ON public.mkt_engine_config FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_unsubscribes in their org" ON public.mkt_unsubscribes FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_feature_signals in their org" ON public.mkt_feature_signals FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_product_decisions in their org" ON public.mkt_product_decisions FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));
CREATE POLICY "Users can update mkt_nps_responses in their org" ON public.mkt_nps_responses FOR UPDATE USING ((org_id = public.get_user_org_id(auth.uid())));

-- ============================================================================
-- RLS POLICIES — DELETE (admin/super_admin only, for manageable tables)
-- ============================================================================
CREATE POLICY "Admins can delete mkt_campaigns in their org" ON public.mkt_campaigns FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));
CREATE POLICY "Admins can delete mkt_campaign_steps in their org" ON public.mkt_campaign_steps FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));
CREATE POLICY "Admins can delete mkt_leads in their org" ON public.mkt_leads FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));
CREATE POLICY "Admins can delete mkt_email_templates in their org" ON public.mkt_email_templates FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));
CREATE POLICY "Admins can delete mkt_whatsapp_templates in their org" ON public.mkt_whatsapp_templates FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));
CREATE POLICY "Admins can delete mkt_call_scripts in their org" ON public.mkt_call_scripts FOR DELETE USING (((org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))));


-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
CREATE TRIGGER update_mkt_campaigns_updated_at BEFORE UPDATE ON public.mkt_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_campaign_steps_updated_at BEFORE UPDATE ON public.mkt_campaign_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_leads_updated_at BEFORE UPDATE ON public.mkt_leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_lead_scores_updated_at BEFORE UPDATE ON public.mkt_lead_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_sequence_enrollments_updated_at BEFORE UPDATE ON public.mkt_sequence_enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_sequence_actions_updated_at BEFORE UPDATE ON public.mkt_sequence_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_email_templates_updated_at BEFORE UPDATE ON public.mkt_email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_whatsapp_templates_updated_at BEFORE UPDATE ON public.mkt_whatsapp_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_call_scripts_updated_at BEFORE UPDATE ON public.mkt_call_scripts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_conversation_memory_updated_at BEFORE UPDATE ON public.mkt_conversation_memory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_ab_tests_updated_at BEFORE UPDATE ON public.mkt_ab_tests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_ab_test_results_updated_at BEFORE UPDATE ON public.mkt_ab_test_results FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_google_ads_campaigns_updated_at BEFORE UPDATE ON public.mkt_google_ads_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_google_ads_keywords_updated_at BEFORE UPDATE ON public.mkt_google_ads_keywords FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_channel_metrics_updated_at BEFORE UPDATE ON public.mkt_channel_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_engine_config_updated_at BEFORE UPDATE ON public.mkt_engine_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_feature_signals_updated_at BEFORE UPDATE ON public.mkt_feature_signals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mkt_product_decisions_updated_at BEFORE UPDATE ON public.mkt_product_decisions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- SEED DEFAULT ENGINE CONFIG
-- ============================================================================
-- This will be populated per-org when the engine is first configured.
-- Placeholder function for service-role access patterns.
COMMENT ON TABLE public.mkt_engine_config IS 'Runtime configuration for the Revenue Engine. Key-value pairs with JSONB values. Seeded per-org on first engine setup.';
COMMENT ON TABLE public.mkt_engine_logs IS 'Audit log for all Revenue Engine edge function executions. Append-only.';
COMMENT ON TABLE public.mkt_product_decisions IS 'Append-only decision record. Decisions can be superseded but never deleted.';
