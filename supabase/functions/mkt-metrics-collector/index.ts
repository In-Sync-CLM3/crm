import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Hardcoded MRR targets by month number since org creation (paise)
const MRR_TARGETS: Record<number, number> = {
  3: 8500000,     // Rs 85,000
  6: 45000000,    // Rs 4,50,000
  9: 99000000,    // Rs 9,90,000
  12: 188000000,  // Rs 18,80,000
};

// Baseline infrastructure cost in paise (Rs 61,000)
const BASELINE_INFRA_COST_PAISE = 6100000;

// Estimated cost per token in paise (for variable cost calculation)
const COST_PER_TOKEN_PAISE = 0.01;

interface OrgMetrics {
  org_id: string;
  period_start: string;
  period_end: string;
  // Revenue
  mrr_total: number | null;
  mrr_new: number | null;
  mrr_expansion: number | null;
  mrr_referral: number | null;
  mrr_recovery: number | null;
  mrr_churned: number | null;
  mrr_net_movement: number | null;
  // Clients
  clients_active: number | null;
  clients_new: number | null;
  clients_churned: number | null;
  clients_india: number | null;
  clients_international: number | null;
  // Funnel
  trials_started: number | null;
  aha_moments_reached: number | null;
  payments_received: number | null;
  trial_to_paid_rate: number | null;
  aha_to_paid_rate: number | null;
  // Costs
  cost_infrastructure: number | null;
  cost_variable: number | null;
  cost_ads: number | null;
  cost_total: number | null;
  gross_margin_pct: number | null;
  // CAC
  cac_organic: number | null;
  cac_paid: number | null;
  cac_blended: number | null;
  // Channel
  email_open_rate: number | null;
  email_click_rate: number | null;
  email_bounce_rate: number | null;
  wa_read_rate: number | null;
  wa_optout_rate: number | null;
  vapi_answer_rate: number | null;
  vapi_positive_rate: number | null;
  ads_ctr: number | null;
  ads_cpa: number | null;
  // LTV
  ltv_india_single: number | null;
  ltv_india_cross: number | null;
  ltv_intl_single: number | null;
  ltv_intl_cross: number | null;
  ltv_blended: number | null;
  ltv_cac_ratio: number | null;
  // Payback
  payback_organic_months: number | null;
  payback_paid_months: number | null;
  // Renewal
  renewal_rate: number | null;
  cross_sell_rate: number | null;
  nps_satisfied_rate: number | null;
  // Targets
  target_mrr: number | null;
  target_variance_pct: number | null;
  on_track: boolean | null;
}

/**
 * Weekly financial metrics collector for the Revenue Engine.
 * Runs via pg_cron every Monday at 1AM UTC.
 * Collects revenue, client, funnel, cost, CAC, channel, LTV, and payback metrics
 * for each org with mkt_campaigns, writing results to mkt_engine_metrics.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-metrics-collector');

  try {
    const supabase = getSupabaseClient();

    // Get all orgs that have mkt_campaigns
    const { data: orgs } = await supabase
      .from('mkt_campaigns')
      .select('org_id');

    const orgIds = [...new Set((orgs || []).map((o) => o.org_id))];

    if (orgIds.length === 0) {
      await logger.info('no-orgs', { message: 'No orgs with mkt_campaigns found' });
      return new Response(
        JSON.stringify({ success: true, orgs_processed: 0, message: 'No orgs with mkt_campaigns' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const periodEnd = now.toISOString().split('T')[0];
    const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const periodStartISO = `${periodStart}T00:00:00Z`;
    const periodEndISO = `${periodEnd}T23:59:59Z`;

    // 4-week rolling window for trial_to_paid_rate
    const fourWeeksAgoISO = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();

    let metricsRecorded = 0;

    for (const orgId of orgIds) {
      try {
        const metrics = await collectOrgMetrics(
          supabase, orgId, periodStart, periodEnd,
          periodStartISO, periodEndISO, fourWeeksAgoISO, now, logger
        );

        const { error: insertError } = await supabase.from('mkt_engine_metrics').insert({
          org_id: orgId,
          period_start: metrics.period_start,
          period_end: metrics.period_end,
          period_type: 'weekly',
          mrr_total: metrics.mrr_total,
          mrr_new: metrics.mrr_new,
          mrr_expansion: metrics.mrr_expansion,
          mrr_referral: metrics.mrr_referral,
          mrr_recovery: metrics.mrr_recovery,
          mrr_churned: metrics.mrr_churned,
          mrr_net_movement: metrics.mrr_net_movement,
          clients_active: metrics.clients_active,
          clients_new: metrics.clients_new,
          clients_churned: metrics.clients_churned,
          clients_india: metrics.clients_india,
          clients_international: metrics.clients_international,
          trials_started: metrics.trials_started,
          aha_moments_reached: metrics.aha_moments_reached,
          payments_received: metrics.payments_received,
          trial_to_paid_rate: metrics.trial_to_paid_rate,
          aha_to_paid_rate: metrics.aha_to_paid_rate,
          cost_infrastructure: metrics.cost_infrastructure,
          cost_variable: metrics.cost_variable,
          cost_ads: metrics.cost_ads,
          cost_total: metrics.cost_total,
          gross_margin_pct: metrics.gross_margin_pct,
          cac_organic: metrics.cac_organic,
          cac_paid: metrics.cac_paid,
          cac_blended: metrics.cac_blended,
          email_open_rate: metrics.email_open_rate,
          email_click_rate: metrics.email_click_rate,
          email_bounce_rate: metrics.email_bounce_rate,
          wa_read_rate: metrics.wa_read_rate,
          wa_optout_rate: metrics.wa_optout_rate,
          vapi_answer_rate: metrics.vapi_answer_rate,
          vapi_positive_rate: metrics.vapi_positive_rate,
          ads_ctr: metrics.ads_ctr,
          ads_cpa: metrics.ads_cpa,
          ltv_india_single: metrics.ltv_india_single,
          ltv_india_cross: metrics.ltv_india_cross,
          ltv_intl_single: metrics.ltv_intl_single,
          ltv_intl_cross: metrics.ltv_intl_cross,
          ltv_blended: metrics.ltv_blended,
          ltv_cac_ratio: metrics.ltv_cac_ratio,
          payback_organic_months: metrics.payback_organic_months,
          payback_paid_months: metrics.payback_paid_months,
          renewal_rate: metrics.renewal_rate,
          cross_sell_rate: metrics.cross_sell_rate,
          nps_satisfied_rate: metrics.nps_satisfied_rate,
          target_mrr: metrics.target_mrr,
          target_variance_pct: metrics.target_variance_pct,
          on_track: metrics.on_track,
        });

        if (insertError) {
          await logger.error('insert-failed', insertError, { org_id: orgId });
        } else {
          metricsRecorded++;
          await logger.info('metrics-recorded', {
            org_id: orgId,
            mrr_total: metrics.mrr_total,
            clients_active: metrics.clients_active,
            on_track: metrics.on_track,
          });
        }
      } catch (err) {
        await logger.error('org-metrics-failed', err, { org_id: orgId });
      }
    }

    await logger.info('collection-complete', {
      orgs_processed: orgIds.length,
      metrics_recorded: metricsRecorded,
    });

    return new Response(
      JSON.stringify({
        success: true,
        orgs_processed: orgIds.length,
        metrics_recorded: metricsRecorded,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ---------------------------------------------------------------------------
// Core collection orchestrator
// ---------------------------------------------------------------------------
async function collectOrgMetrics(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  periodStart: string,
  periodEnd: string,
  periodStartISO: string,
  periodEndISO: string,
  fourWeeksAgoISO: string,
  now: Date,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<OrgMetrics> {
  // Run all independent queries in parallel
  const [
    revenueMetrics,
    clientMetrics,
    funnelMetrics,
    costMetrics,
    channelMetrics,
    orgInfo,
  ] = await Promise.all([
    collectRevenueMetrics(supabase, orgId, periodStartISO, periodEndISO),
    collectClientMetrics(supabase, orgId, periodStartISO, periodEndISO),
    collectFunnelMetrics(supabase, orgId, periodStartISO, periodEndISO, fourWeeksAgoISO),
    collectCostMetrics(supabase, orgId, periodStartISO, periodEndISO),
    collectChannelMetrics(supabase, orgId, periodStartISO, periodEndISO),
    supabase.from('organizations').select('created_at').eq('id', orgId).single(),
  ]);

  // Derived: gross margin
  const costTotal = (costMetrics.cost_infrastructure || 0)
    + (costMetrics.cost_variable || 0)
    + (costMetrics.cost_ads || 0);
  const grossMarginPct = safeDivide(
    ((revenueMetrics.mrr_total || 0) - costTotal),
    revenueMetrics.mrr_total || 0,
  ) * 100;

  // CAC metrics
  const cacMetrics = calculateCAC(
    clientMetrics.clients_new_organic,
    clientMetrics.clients_new_paid,
    clientMetrics.clients_new || 0,
    costMetrics.cost_infrastructure || 0,
    costMetrics.cost_variable || 0,
    costMetrics.cost_ads || 0,
    costTotal,
  );

  // Renewal & cross-sell from subscription invoices
  const renewalData = await collectRenewalMetrics(supabase, orgId);

  // NPS satisfaction
  const npsData = await collectNPSMetrics(supabase, orgId);

  // LTV calculations per segment
  const ltvMetrics = calculateLTV(
    revenueMetrics.mrr_total || 0,
    clientMetrics.clients_active || 0,
    clientMetrics.clients_india || 0,
    clientMetrics.clients_international || 0,
    renewalData.renewal_rate,
    renewalData.cross_sell_rate,
    grossMarginPct / 100,
  );

  // Payback
  const avgMrrPerClient = clientMetrics.clients_active
    ? Math.round((revenueMetrics.mrr_total || 0) / clientMetrics.clients_active)
    : 0;
  const grossMarginFraction = grossMarginPct / 100;
  const paybackOrganic = safeDivide(
    cacMetrics.cac_organic || 0,
    avgMrrPerClient * Math.max(grossMarginFraction, 0),
  );
  const paybackPaid = safeDivide(
    cacMetrics.cac_paid || 0,
    avgMrrPerClient * Math.max(grossMarginFraction, 0),
  );

  // Target comparison
  const orgCreatedAt = orgInfo.data?.created_at ? new Date(orgInfo.data.created_at) : now;
  const monthsSinceCreation = Math.max(1, Math.round(
    (now.getTime() - orgCreatedAt.getTime()) / (30.44 * 24 * 60 * 60 * 1000)
  ));
  const targetMetrics = calculateTargets(revenueMetrics.mrr_total || 0, monthsSinceCreation);

  return {
    org_id: orgId,
    period_start: periodStart,
    period_end: periodEnd,
    // Revenue
    mrr_total: revenueMetrics.mrr_total,
    mrr_new: revenueMetrics.mrr_new,
    mrr_expansion: revenueMetrics.mrr_expansion,
    mrr_referral: revenueMetrics.mrr_referral,
    mrr_recovery: revenueMetrics.mrr_recovery,
    mrr_churned: revenueMetrics.mrr_churned,
    mrr_net_movement: revenueMetrics.mrr_net_movement,
    // Clients
    clients_active: clientMetrics.clients_active,
    clients_new: clientMetrics.clients_new,
    clients_churned: clientMetrics.clients_churned,
    clients_india: clientMetrics.clients_india,
    clients_international: clientMetrics.clients_international,
    // Funnel
    trials_started: funnelMetrics.trials_started,
    aha_moments_reached: funnelMetrics.aha_moments_reached,
    payments_received: funnelMetrics.payments_received,
    trial_to_paid_rate: funnelMetrics.trial_to_paid_rate,
    aha_to_paid_rate: funnelMetrics.aha_to_paid_rate,
    // Costs
    cost_infrastructure: costMetrics.cost_infrastructure,
    cost_variable: costMetrics.cost_variable,
    cost_ads: costMetrics.cost_ads,
    cost_total: costTotal,
    gross_margin_pct: round2(grossMarginPct),
    // CAC
    cac_organic: cacMetrics.cac_organic,
    cac_paid: cacMetrics.cac_paid,
    cac_blended: cacMetrics.cac_blended,
    // Channel
    email_open_rate: channelMetrics.email_open_rate,
    email_click_rate: channelMetrics.email_click_rate,
    email_bounce_rate: channelMetrics.email_bounce_rate,
    wa_read_rate: channelMetrics.wa_read_rate,
    wa_optout_rate: channelMetrics.wa_optout_rate,
    vapi_answer_rate: channelMetrics.vapi_answer_rate,
    vapi_positive_rate: channelMetrics.vapi_positive_rate,
    ads_ctr: channelMetrics.ads_ctr,
    ads_cpa: channelMetrics.ads_cpa,
    // LTV
    ltv_india_single: ltvMetrics.ltv_india_single,
    ltv_india_cross: ltvMetrics.ltv_india_cross,
    ltv_intl_single: ltvMetrics.ltv_intl_single,
    ltv_intl_cross: ltvMetrics.ltv_intl_cross,
    ltv_blended: ltvMetrics.ltv_blended,
    ltv_cac_ratio: cacMetrics.cac_blended
      ? round2(safeDivide(ltvMetrics.ltv_blended || 0, cacMetrics.cac_blended))
      : null,
    // Payback
    payback_organic_months: paybackOrganic !== null ? round2(paybackOrganic) : null,
    payback_paid_months: paybackPaid !== null ? round2(paybackPaid) : null,
    // Renewal
    renewal_rate: renewalData.renewal_rate,
    cross_sell_rate: renewalData.cross_sell_rate,
    nps_satisfied_rate: npsData.nps_satisfied_rate,
    // Targets
    target_mrr: targetMetrics.target_mrr,
    target_variance_pct: targetMetrics.target_variance_pct,
    on_track: targetMetrics.on_track,
  };
}

// ---------------------------------------------------------------------------
// 1. Revenue metrics from subscription_invoices and client_invoices
// ---------------------------------------------------------------------------
async function collectRevenueMetrics(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  periodStartISO: string,
  periodEndISO: string,
) {
  // Fetch all subscription invoices for active MRR (paid status)
  const [activeSubsRes, weekInvoicesRes] = await Promise.all([
    supabase
      .from('subscription_invoices')
      .select('total_amount, payment_status')
      .eq('org_id', orgId)
      .eq('payment_status', 'paid'),
    supabase
      .from('client_invoices')
      .select('amount, status, document_type, created_at, notes')
      .eq('org_id', orgId)
      .eq('document_type', 'invoice')
      .gte('created_at', periodStartISO)
      .lte('created_at', periodEndISO),
  ]);

  const activeSubs = activeSubsRes.data || [];
  const weekInvoices = weekInvoicesRes.data || [];

  // MRR total: sum of all active subscription amounts (convert rupees to paise)
  const mrrTotal = Math.round(
    activeSubs.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0) * 100
  );

  // Categorize week's invoices by notes/type heuristics (paise)
  let mrrNew = 0;
  let mrrExpansion = 0;
  let mrrReferral = 0;
  let mrrRecovery = 0;
  let mrrChurned = 0;

  for (const inv of weekInvoices) {
    const amountPaise = Math.round((Number(inv.amount) || 0) * 100);
    const notesLower = (inv.notes || '').toLowerCase();

    if (inv.status === 'cancelled') {
      mrrChurned += amountPaise;
    } else if (notesLower.includes('referral')) {
      mrrReferral += amountPaise;
    } else if (notesLower.includes('expansion') || notesLower.includes('upgrade')) {
      mrrExpansion += amountPaise;
    } else if (notesLower.includes('recovery') || notesLower.includes('reactivat')) {
      mrrRecovery += amountPaise;
    } else {
      mrrNew += amountPaise;
    }
  }

  const mrrNetMovement = mrrNew + mrrExpansion + mrrReferral + mrrRecovery - mrrChurned;

  return {
    mrr_total: mrrTotal,
    mrr_new: mrrNew,
    mrr_expansion: mrrExpansion,
    mrr_referral: mrrReferral,
    mrr_recovery: mrrRecovery,
    mrr_churned: mrrChurned,
    mrr_net_movement: mrrNetMovement,
  };
}

// ---------------------------------------------------------------------------
// 2. Client metrics from clients table
// ---------------------------------------------------------------------------
async function collectClientMetrics(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  periodStartISO: string,
  periodEndISO: string,
) {
  const [activeRes, newRes, churnedRes, allClientsRes] = await Promise.all([
    // Active clients total
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active'),
    // New clients this week
    supabase
      .from('clients')
      .select('id, country, source:contacts(source)')
      .eq('org_id', orgId)
      .gte('converted_at', periodStartISO)
      .lte('converted_at', periodEndISO),
    // Churned this week
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'churned')
      .gte('status_updated_at', periodStartISO)
      .lte('status_updated_at', periodEndISO),
    // All active clients for India/International split
    supabase
      .from('clients')
      .select('country')
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ]);

  const newClients = newRes.data || [];
  const allClients = allClientsRes.data || [];

  // India/International split
  const clientsIndia = allClients.filter((c) =>
    !c.country || c.country.toLowerCase() === 'india'
  ).length;
  const clientsInternational = allClients.length - clientsIndia;

  // Source-based split for new clients (organic vs paid)
  let newOrganic = 0;
  let newPaid = 0;
  for (const c of newClients) {
    const source = ((c as Record<string, unknown>).source as Record<string, unknown>)?.source as string || '';
    const sourceLower = source.toLowerCase();
    if (sourceLower.includes('google_ads') || sourceLower.includes('ads') || sourceLower.includes('paid')) {
      newPaid++;
    } else {
      newOrganic++;
    }
  }

  return {
    clients_active: activeRes.count || 0,
    clients_new: newClients.length,
    clients_churned: churnedRes.count || 0,
    clients_india: clientsIndia,
    clients_international: clientsInternational,
    clients_new_organic: newOrganic,
    clients_new_paid: newPaid,
  };
}

// ---------------------------------------------------------------------------
// 3. Funnel metrics from mkt_leads and mkt_activation_events
// ---------------------------------------------------------------------------
async function collectFunnelMetrics(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  periodStartISO: string,
  periodEndISO: string,
  fourWeeksAgoISO: string,
) {
  const [trialsRes, ahaRes, paymentsRes, trialsRollingRes, paymentsRollingRes] = await Promise.all([
    // Trials started this week (new mkt_leads)
    supabase
      .from('mkt_leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', periodStartISO)
      .lte('created_at', periodEndISO),
    // Aha moments this week
    supabase
      .from('mkt_activation_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('event_type', 'aha_moment')
      .gte('occurred_at', periodStartISO)
      .lte('occurred_at', periodEndISO),
    // Payments (converted leads) this week
    supabase
      .from('mkt_leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'converted')
      .gte('converted_at', periodStartISO)
      .lte('converted_at', periodEndISO),
    // Rolling 4-week trials for trial_to_paid_rate
    supabase
      .from('mkt_leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', fourWeeksAgoISO)
      .lte('created_at', periodEndISO),
    // Rolling 4-week conversions
    supabase
      .from('mkt_leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'converted')
      .gte('converted_at', fourWeeksAgoISO)
      .lte('converted_at', periodEndISO),
  ]);

  const trialsStarted = trialsRes.count || 0;
  const ahaMoments = ahaRes.count || 0;
  const payments = paymentsRes.count || 0;
  const trialsRolling = trialsRollingRes.count || 0;
  const paymentsRolling = paymentsRollingRes.count || 0;

  return {
    trials_started: trialsStarted,
    aha_moments_reached: ahaMoments,
    payments_received: payments,
    trial_to_paid_rate: trialsRolling > 0
      ? round4(paymentsRolling / trialsRolling)
      : null,
    aha_to_paid_rate: ahaMoments > 0
      ? round4(payments / ahaMoments)
      : null,
  };
}

// ---------------------------------------------------------------------------
// 4. Cost metrics
// ---------------------------------------------------------------------------
async function collectCostMetrics(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  periodStartISO: string,
  periodEndISO: string,
) {
  const [configRes, logsRes, adsRes] = await Promise.all([
    // Check mkt_engine_config for custom infrastructure cost
    supabase
      .from('mkt_engine_config')
      .select('config_value')
      .eq('org_id', orgId)
      .eq('config_key', 'cost_infrastructure')
      .single(),
    // Variable cost: estimate from token usage in mkt_engine_logs
    supabase
      .from('mkt_engine_logs')
      .select('tokens_used')
      .eq('org_id', orgId)
      .gte('created_at', periodStartISO)
      .lte('created_at', periodEndISO)
      .not('tokens_used', 'is', null),
    // Google Ads cost this week
    supabase
      .from('mkt_google_ads_campaigns')
      .select('cost')
      .eq('org_id', orgId)
      .gte('metrics_date', periodStartISO.split('T')[0])
      .lte('metrics_date', periodEndISO.split('T')[0]),
  ]);

  // Infrastructure cost
  const configInfra = configRes.data?.config_value;
  const costInfrastructure = typeof configInfra === 'number'
    ? configInfra
    : (configInfra && typeof configInfra === 'object' && 'value' in (configInfra as Record<string, unknown>))
      ? Number((configInfra as Record<string, number>).value)
      : BASELINE_INFRA_COST_PAISE;

  // Variable cost from token usage
  const logs = logsRes.data || [];
  const totalTokens = logs.reduce((sum, l) => sum + (l.tokens_used || 0), 0);
  const costVariable = Math.round(totalTokens * COST_PER_TOKEN_PAISE);

  // Ads cost (stored as numeric in rupees in the table, convert to paise)
  const adsCampaigns = adsRes.data || [];
  const costAds = Math.round(
    adsCampaigns.reduce((sum, c) => sum + (Number(c.cost) || 0), 0) * 100
  );

  return {
    cost_infrastructure: costInfrastructure,
    cost_variable: costVariable,
    cost_ads: costAds,
  };
}

// ---------------------------------------------------------------------------
// 5. Channel metrics from mkt_sequence_actions and mkt_google_ads_campaigns
// ---------------------------------------------------------------------------
async function collectChannelMetrics(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  periodStartISO: string,
  periodEndISO: string,
) {
  const [actionsRes, adsRes] = await Promise.all([
    supabase
      .from('mkt_sequence_actions')
      .select('channel, status, opened_at, clicked_at, replied_at')
      .eq('org_id', orgId)
      .gte('created_at', periodStartISO)
      .lte('created_at', periodEndISO),
    supabase
      .from('mkt_google_ads_campaigns')
      .select('impressions, clicks, cost, conversions, ctr')
      .eq('org_id', orgId)
      .gte('metrics_date', periodStartISO.split('T')[0])
      .lte('metrics_date', periodEndISO.split('T')[0]),
  ]);

  const actions = actionsRes.data || [];
  const ads = adsRes.data || [];

  // Email metrics
  const emails = actions.filter((a) => a.channel === 'email');
  const emailsSent = emails.length;
  const emailsOpened = emails.filter((a) => a.opened_at).length;
  const emailsClicked = emails.filter((a) => a.clicked_at).length;
  const emailsBounced = emails.filter((a) => ['bounced', 'failed'].includes(a.status)).length;

  // WhatsApp metrics
  const waActions = actions.filter((a) => a.channel === 'whatsapp');
  const waSent = waActions.length;
  const waRead = waActions.filter((a) => a.opened_at).length; // opened_at used as read indicator
  const waOptout = waActions.filter((a) => a.status === 'unsubscribed' || a.replied_at === null && a.status === 'failed').length;

  // VAPI/call metrics
  const calls = actions.filter((a) => a.channel === 'call');
  const callsMade = calls.length;
  const callsAnswered = calls.filter((a) => a.status === 'delivered' || a.opened_at).length;
  const callsPositive = calls.filter((a) => a.replied_at).length; // replied_at indicates positive outcome

  // Google Ads aggregates
  const totalImpressions = ads.reduce((s, a) => s + (Number(a.impressions) || 0), 0);
  const totalClicks = ads.reduce((s, a) => s + (Number(a.clicks) || 0), 0);
  const totalAdsCost = ads.reduce((s, a) => s + (Number(a.cost) || 0), 0);
  const totalConversions = ads.reduce((s, a) => s + (Number(a.conversions) || 0), 0);

  return {
    email_open_rate: emailsSent > 0 ? round4(emailsOpened / emailsSent) : null,
    email_click_rate: emailsSent > 0 ? round4(emailsClicked / emailsSent) : null,
    email_bounce_rate: emailsSent > 0 ? round4(emailsBounced / emailsSent) : null,
    wa_read_rate: waSent > 0 ? round4(waRead / waSent) : null,
    wa_optout_rate: waSent > 0 ? round4(waOptout / waSent) : null,
    vapi_answer_rate: callsMade > 0 ? round4(callsAnswered / callsMade) : null,
    vapi_positive_rate: callsMade > 0 ? round4(callsPositive / callsMade) : null,
    ads_ctr: totalImpressions > 0 ? round4(totalClicks / totalImpressions) : null,
    ads_cpa: totalConversions > 0 ? Math.round((totalAdsCost * 100) / totalConversions) : null, // paise
  };
}

// ---------------------------------------------------------------------------
// 6. Renewal & cross-sell metrics
// ---------------------------------------------------------------------------
async function collectRenewalMetrics(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
) {
  // Renewal rate: paid invoices vs total invoices in last quarter
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [totalSubsRes, paidSubsRes, crossSellRes, totalClientsRes] = await Promise.all([
    supabase
      .from('subscription_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', threeMonthsAgo),
    supabase
      .from('subscription_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('payment_status', 'paid')
      .gte('created_at', threeMonthsAgo),
    // Cross-sell: clients with >1 distinct invoice this quarter
    supabase
      .from('client_invoices')
      .select('client_id')
      .eq('org_id', orgId)
      .eq('document_type', 'invoice')
      .gte('created_at', threeMonthsAgo)
      .not('client_id', 'is', null),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ]);

  const totalSubs = totalSubsRes.count || 0;
  const paidSubs = paidSubsRes.count || 0;
  const renewalRate = totalSubs > 0 ? round4(paidSubs / totalSubs) : null;

  // Cross-sell rate: clients with multiple invoices / total active clients
  const invoiceClients = crossSellRes.data || [];
  const clientInvoiceCounts: Record<string, number> = {};
  for (const inv of invoiceClients) {
    if (inv.client_id) {
      clientInvoiceCounts[inv.client_id] = (clientInvoiceCounts[inv.client_id] || 0) + 1;
    }
  }
  const crossSoldClients = Object.values(clientInvoiceCounts).filter((c) => c > 1).length;
  const totalActiveClients = totalClientsRes.count || 0;
  const crossSellRate = totalActiveClients > 0 ? round4(crossSoldClients / totalActiveClients) : null;

  return { renewal_rate: renewalRate, cross_sell_rate: crossSellRate };
}

// ---------------------------------------------------------------------------
// 7. NPS satisfaction metrics
// ---------------------------------------------------------------------------
async function collectNPSMetrics(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
) {
  const [totalNpsRes, satisfiedNpsRes] = await Promise.all([
    supabase
      .from('mkt_nps_responses')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('mkt_nps_responses')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('score', 7), // Promoters (9-10) + Passives (7-8)
  ]);

  const total = totalNpsRes.count || 0;
  const satisfied = satisfiedNpsRes.count || 0;

  return {
    nps_satisfied_rate: total > 0 ? round4(satisfied / total) : null,
  };
}

// ---------------------------------------------------------------------------
// 8. CAC calculation
// ---------------------------------------------------------------------------
function calculateCAC(
  clientsNewOrganic: number,
  clientsNewPaid: number,
  clientsNewTotal: number,
  costInfra: number,
  costVariable: number,
  costAds: number,
  costTotal: number,
) {
  return {
    cac_organic: clientsNewOrganic > 0
      ? Math.round((costInfra + costVariable) / clientsNewOrganic)
      : null,
    cac_paid: clientsNewPaid > 0
      ? Math.round(costAds / clientsNewPaid)
      : null,
    cac_blended: clientsNewTotal > 0
      ? Math.round(costTotal / clientsNewTotal)
      : null,
  };
}

// ---------------------------------------------------------------------------
// 9. LTV calculation per segment
// ---------------------------------------------------------------------------
function calculateLTV(
  mrrTotal: number,
  clientsActive: number,
  clientsIndia: number,
  clientsInternational: number,
  renewalRate: number | null,
  crossSellRate: number | null,
  grossMarginFraction: number,
) {
  if (!clientsActive || clientsActive === 0) {
    return {
      ltv_india_single: null,
      ltv_india_cross: null,
      ltv_intl_single: null,
      ltv_intl_cross: null,
      ltv_blended: null,
    };
  }

  const avgMrrPerClient = mrrTotal / clientsActive;

  // Monthly churn from quarterly renewal rate: 1 - (renewal_rate)^(1/3)
  const qRenewal = renewalRate ?? 0.85; // default 85% if no data
  const monthlyChurnRate = 1 - Math.pow(Math.max(qRenewal, 0.01), 1 / 3);
  const retentionMonths = monthlyChurnRate > 0 ? (1 / monthlyChurnRate) : 120; // cap at 10 years

  const effectiveGrossMargin = Math.max(grossMarginFraction, 0);
  const crossMultiplier = crossSellRate ? (1 + crossSellRate) : 1;

  // India: assume 80% of avg MRR per India client, International: 120% (premium pricing)
  const indiaAvgMrr = avgMrrPerClient * 0.8;
  const intlAvgMrr = avgMrrPerClient * 1.2;

  const ltvIndiaSingle = Math.round(indiaAvgMrr * retentionMonths * effectiveGrossMargin);
  const ltvIndiaCross = Math.round(indiaAvgMrr * crossMultiplier * retentionMonths * effectiveGrossMargin);
  const ltvIntlSingle = Math.round(intlAvgMrr * retentionMonths * effectiveGrossMargin);
  const ltvIntlCross = Math.round(intlAvgMrr * crossMultiplier * retentionMonths * effectiveGrossMargin);

  // Blended: weighted average by client counts
  const totalClients = clientsIndia + clientsInternational;
  const indiaWeight = totalClients > 0 ? clientsIndia / totalClients : 0.8;
  const intlWeight = totalClients > 0 ? clientsInternational / totalClients : 0.2;

  // Average single and cross-sold LTV using cross-sell rate as proportion
  const effectiveCrossRate = crossSellRate ?? 0;
  const ltvBlended = Math.round(
    indiaWeight * (ltvIndiaSingle * (1 - effectiveCrossRate) + ltvIndiaCross * effectiveCrossRate) +
    intlWeight * (ltvIntlSingle * (1 - effectiveCrossRate) + ltvIntlCross * effectiveCrossRate)
  );

  return {
    ltv_india_single: ltvIndiaSingle,
    ltv_india_cross: ltvIndiaCross,
    ltv_intl_single: ltvIntlSingle,
    ltv_intl_cross: ltvIntlCross,
    ltv_blended: ltvBlended,
  };
}

// ---------------------------------------------------------------------------
// 10. Target comparison
// ---------------------------------------------------------------------------
function calculateTargets(mrrTotal: number, monthsSinceCreation: number) {
  // Find the nearest milestone month
  const milestones = [3, 6, 9, 12];
  let targetMrr: number | null = null;

  // Find the current applicable target (most recent milestone <= current month)
  // If beyond 12 months, extrapolate linearly from month 12 target
  if (monthsSinceCreation >= 12) {
    const month12Target = MRR_TARGETS[12];
    // Extrapolate: assume same growth rate continues
    targetMrr = Math.round(month12Target * (monthsSinceCreation / 12));
  } else {
    // Interpolate between milestones
    let prevMonth = 0;
    let prevTarget = 0;
    for (const m of milestones) {
      if (monthsSinceCreation <= m) {
        const range = m - prevMonth;
        const progress = (monthsSinceCreation - prevMonth) / range;
        targetMrr = Math.round(prevTarget + (MRR_TARGETS[m] - prevTarget) * progress);
        break;
      }
      prevMonth = m;
      prevTarget = MRR_TARGETS[m];
    }
  }

  if (targetMrr === null || targetMrr === 0) {
    return { target_mrr: null, target_variance_pct: null, on_track: null };
  }

  const variancePct = round2(((mrrTotal - targetMrr) / targetMrr) * 100);
  const onTrack = mrrTotal >= targetMrr;

  return {
    target_mrr: targetMrr,
    target_variance_pct: variancePct,
    on_track: onTrack,
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0 || !isFinite(denominator)) return null;
  const result = numerator / denominator;
  return isFinite(result) ? result : null;
}

function round2(value: number | null): number | null {
  if (value === null || !isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
