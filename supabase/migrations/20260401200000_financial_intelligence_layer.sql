-- ============================================================================
-- Financial Intelligence Layer: mkt_engine_metrics + mkt_engine_logs updates
-- ============================================================================

-- New table: mkt_engine_metrics — single source of truth for all financial performance data
CREATE TABLE public.mkt_engine_metrics (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid REFERENCES public.organizations(id),
  recorded_at           timestamptz DEFAULT now(),
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  period_type           text NOT NULL,  -- daily | weekly | monthly

  -- Revenue metrics (paise)
  mrr_total             integer,
  mrr_new               integer,
  mrr_expansion         integer,
  mrr_referral          integer,
  mrr_recovery          integer,
  mrr_churned           integer,
  mrr_net_movement      integer,

  -- Client metrics
  clients_active        integer,
  clients_new           integer,
  clients_churned       integer,
  clients_india         integer,
  clients_international integer,

  -- Funnel metrics
  trials_started        integer,
  aha_moments_reached   integer,
  payments_received     integer,
  trial_to_paid_rate    numeric(5,4),
  aha_to_paid_rate      numeric(5,4),

  -- Cost metrics (paise)
  cost_infrastructure   integer,
  cost_variable         integer,
  cost_ads              integer,
  cost_total            integer,
  gross_margin_pct      numeric(5,2),

  -- CAC metrics (paise)
  cac_organic           integer,
  cac_paid              integer,
  cac_blended           integer,

  -- Channel metrics
  email_open_rate       numeric(5,4),
  email_click_rate      numeric(5,4),
  email_bounce_rate     numeric(5,4),
  wa_read_rate          numeric(5,4),
  wa_optout_rate        numeric(5,4),
  vapi_answer_rate      numeric(5,4),
  vapi_positive_rate    numeric(5,4),
  ads_ctr               numeric(5,4),
  ads_cpa               integer,

  -- Targets (copied at period start for comparison)
  target_mrr            integer,
  target_variance_pct   numeric(5,2),
  on_track              boolean,

  -- Breakpoints triggered this period
  breakpoints_triggered integer DEFAULT 0,
  breakpoint_details    jsonb,

  -- Segment-level LTV/CAC
  ltv_india_single      integer,
  ltv_india_cross       integer,
  ltv_intl_single       integer,
  ltv_intl_cross        integer,
  ltv_blended           integer,
  ltv_cac_ratio         numeric(5,2),

  -- Payback
  payback_organic_months  numeric(5,2),
  payback_paid_months     numeric(5,2),

  -- Renewal
  renewal_rate          numeric(5,4),
  cross_sell_rate       numeric(5,4),
  nps_satisfied_rate    numeric(5,4),

  created_at            timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.mkt_engine_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own org metrics" ON public.mkt_engine_metrics
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- Indexes for dashboard queries
CREATE INDEX idx_mkt_engine_metrics_period
  ON public.mkt_engine_metrics (org_id, period_type, period_end DESC);

CREATE INDEX idx_mkt_engine_metrics_weekly
  ON public.mkt_engine_metrics (period_type, period_end DESC)
  WHERE period_type = 'weekly';

-- Update mkt_engine_logs for breakpoint tracking on dashboard
ALTER TABLE public.mkt_engine_logs ADD COLUMN IF NOT EXISTS log_type text DEFAULT 'info';
  -- values: info | warn | error | breakpoint
ALTER TABLE public.mkt_engine_logs ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.mkt_engine_logs ADD COLUMN IF NOT EXISTS resolved_by text;
  -- 'amit' when resolved via email reply, 'auto' when auto-resolved
ALTER TABLE public.mkt_engine_logs ADD COLUMN IF NOT EXISTS paused_component text;
ALTER TABLE public.mkt_engine_logs ADD COLUMN IF NOT EXISTS alert_email_sent_at timestamptz;

-- Index for dashboard breakpoint query
CREATE INDEX IF NOT EXISTS idx_engine_logs_breakpoints
  ON public.mkt_engine_logs(log_type, resolved_at)
  WHERE log_type = 'breakpoint';
