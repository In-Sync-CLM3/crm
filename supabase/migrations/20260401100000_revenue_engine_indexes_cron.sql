-- ============================================================================
-- Revenue Engine: Indexes + pg_cron Schedules
-- ============================================================================

-- ============================================================================
-- CRITICAL INDEXES — Hot paths for scheduler and queries
-- ============================================================================

-- Scheduler hot path: executor queries due enrollments every 5 minutes
CREATE INDEX IF NOT EXISTS idx_mkt_enrollments_next_action
  ON public.mkt_sequence_enrollments (next_action_at)
  WHERE status = 'active';

-- Lead prioritization: scoring queries by org + score
CREATE INDEX IF NOT EXISTS idx_mkt_leads_org_score
  ON public.mkt_leads (org_id, total_score DESC);

-- Lead dedup on sourcing: prevent duplicate imports
CREATE INDEX IF NOT EXISTS idx_mkt_leads_email
  ON public.mkt_leads (email)
  WHERE email IS NOT NULL;

-- Lead dedup by org + email (unique within org)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_leads_org_email
  ON public.mkt_leads (org_id, email)
  WHERE email IS NOT NULL;

-- Action lookup: sequence actions by enrollment + step
CREATE INDEX IF NOT EXISTS idx_mkt_actions_enrollment_step
  ON public.mkt_sequence_actions (enrollment_id, step_number);

-- Conversation memory: latest context fetch per lead
CREATE INDEX IF NOT EXISTS idx_mkt_memory_lead_updated
  ON public.mkt_conversation_memory (lead_id, updated_at DESC);

-- Lead scoring: find leads needing re-scoring
CREATE INDEX IF NOT EXISTS idx_mkt_leads_scored_at
  ON public.mkt_leads (org_id, scored_at)
  WHERE status IN ('new', 'enriched', 'scored', 'enrolled');

-- Sequence enrollments by campaign
CREATE INDEX IF NOT EXISTS idx_mkt_enrollments_campaign
  ON public.mkt_sequence_enrollments (campaign_id, status);

-- Feature signals not yet surfaced (for Wednesday report)
CREATE INDEX IF NOT EXISTS idx_mkt_feature_signals_unsurfaced
  ON public.mkt_feature_signals (org_id, product_key, surfaced_in_report)
  WHERE surfaced_in_report = false;

-- Engine logs: recent logs per function
CREATE INDEX IF NOT EXISTS idx_mkt_engine_logs_function
  ON public.mkt_engine_logs (function_name, created_at DESC);

-- NPS responses by product (for product intelligence reporter)
CREATE INDEX IF NOT EXISTS idx_mkt_nps_product
  ON public.mkt_nps_responses (org_id, product_key, responded_at DESC);

-- Activation events by product (for drop-off analysis)
CREATE INDEX IF NOT EXISTS idx_mkt_activation_product
  ON public.mkt_activation_events (org_id, product_key, event_type);

-- Unsubscribes lookup: checked before every send
CREATE INDEX IF NOT EXISTS idx_mkt_unsubscribes_lookup
  ON public.mkt_unsubscribes (org_id, email, channel);

-- Google Ads feedback: unpushed conversions
CREATE INDEX IF NOT EXISTS idx_mkt_gads_feedback_unpushed
  ON public.mkt_google_ads_feedback (pushed_to_ga4)
  WHERE pushed_to_ga4 = false;

-- Channel metrics by date
CREATE INDEX IF NOT EXISTS idx_mkt_channel_metrics_date
  ON public.mkt_channel_metrics (org_id, metric_date DESC);

-- A/B tests: active tests for evaluation
CREATE INDEX IF NOT EXISTS idx_mkt_ab_tests_active
  ON public.mkt_ab_tests (status)
  WHERE status = 'active';

-- Product decisions: for decision check before Wednesday report
CREATE INDEX IF NOT EXISTS idx_mkt_product_decisions_lookup
  ON public.mkt_product_decisions (org_id, product_key, decision_type);

-- Drop-off snapshots: weekly comparison
CREATE INDEX IF NOT EXISTS idx_mkt_dropoff_snapshots_date
  ON public.mkt_dropoff_snapshots (org_id, product_key, snapshot_date DESC);


-- ============================================================================
-- pg_cron SCHEDULES
-- ============================================================================
-- Note: pg_cron + pg_net must be enabled in the Supabase project.
-- These use net.http_post to invoke edge functions via the Supabase URL.
-- ============================================================================

DO $outer$
BEGIN
  -- Only create cron jobs if the cron schema/extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Every 5 minutes: Sequence executor (core orchestrator)
    PERFORM cron.schedule(
      'mkt-sequence-executor',
      '*/5 * * * *',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-sequence-executor',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    -- Every 15 minutes: Lead scorer (re-score leads with new signals)
    PERFORM cron.schedule(
      'mkt-lead-scorer',
      '*/15 * * * *',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-lead-scorer',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    -- Every hour: A/B test evaluator (check statistical significance)
    PERFORM cron.schedule(
      'mkt-ab-test-evaluator',
      '0 * * * *',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-ab-test-evaluator',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    -- Every 6 hours: Apollo sourcer (source new leads)
    PERFORM cron.schedule(
      'mkt-apollo-sourcer',
      '0 */6 * * *',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-apollo-sourcer',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    -- Daily 2:00 AM UTC: Campaign optimizer (LLM-powered optimization)
    PERFORM cron.schedule(
      'mkt-campaign-optimizer',
      '0 2 * * *',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-campaign-optimizer',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    -- Daily 3:00 AM UTC: Google Ads sync (pull metrics + push conversions)
    PERFORM cron.schedule(
      'mkt-google-ads-sync',
      '0 3 * * *',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-google-ads-sync',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    -- Daily 6:00 AM UTC (11:30 AM IST): Daily digest
    PERFORM cron.schedule(
      'mkt-daily-digest',
      '0 6 * * *',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-daily-digest',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    -- Wednesday 2:30 AM UTC (8:00 AM IST): Product Intelligence Reporter
    PERFORM cron.schedule(
      'mkt-product-intelligence-reporter',
      '30 2 * * 3',
      $sql$SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/mkt-product-intelligence-reporter',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )$sql$
    );

    RAISE NOTICE 'Revenue Engine: 8 pg_cron jobs scheduled successfully';
  ELSE
    RAISE NOTICE 'pg_cron extension not found — skipping cron job creation. Enable pg_cron and re-run.';
  END IF;
END $outer$;
