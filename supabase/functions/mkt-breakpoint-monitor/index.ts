import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Breakpoint threshold definitions
// ---------------------------------------------------------------------------

interface BreakpointDef {
  name: string;
  category: 'revenue' | 'conversion' | 'operational';
  /** Number of consecutive weeks/periods required to trigger (1 = single occurrence) */
  consecutiveWeeks: number;
  /** If true, only applies after the org is older than 3 months */
  afterMonth3: boolean;
  /** Component to pause when triggered */
  pausedComponent: string;
  /** Evaluate against the latest N weekly metric rows */
  check: (rows: MetricRow[], ctx: OrgContext) => BreakpointResult | null;
}

interface MetricRow {
  period_start: string;
  period_end: string;
  mrr_total: number | null;
  mrr_net_movement: number | null;
  trial_to_paid_rate: number | null;
  aha_to_paid_rate: number | null;
  gross_margin_pct: number | null;
  cac_blended: number | null;
  cost_total: number | null;
  email_bounce_rate: number | null;
  wa_optout_rate: number | null;
  clients_active: number | null;
  clients_churned: number | null;
}

interface OrgContext {
  orgId: string;
  orgCreatedAt: string;
  isAfterMonth3: boolean;
  /** Per-product aha_to_paid rates from mkt_activation_events */
  productAhaRates: Record<string, number>;
  /** Monthly churn rates (last 2 months) computed from monthly metrics */
  monthlyChurnRates: number[];
  /** Daily token spend from mkt_engine_logs */
  maxDailyTokenSpend: number;
  /** "do not call" complaint count in last 7 days */
  dncComplaintCount: number;
}

interface BreakpointResult {
  triggered: boolean;
  data: Record<string, unknown>;
}

function mrrGrowthRate(current: number, previous: number): number {
  if (previous === 0) return 0;
  return (current - previous) / previous;
}

const BREAKPOINT_DEFS: BreakpointDef[] = [
  // ---- Revenue Breakpoints ----
  {
    name: 'MRR Growth Stall',
    category: 'revenue',
    consecutiveWeeks: 3,
    afterMonth3: true,
    pausedComponent: 'paid-ads',
    check: (rows, ctx) => {
      if (!ctx.isAfterMonth3 || rows.length < 3) return null;
      const growthRates = [];
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i].mrr_total ?? 0;
        const curr = rows[i - 1].mrr_total ?? 0;
        growthRates.push(mrrGrowthRate(curr, prev));
      }
      const allStalled = growthRates.slice(0, 2).every((r) => r < 0.10);
      if (!allStalled) return null;
      return {
        triggered: true,
        data: {
          growth_rates: growthRates.slice(0, 2).map((r) => Number((r * 100).toFixed(2))),
          threshold: '< 10% for 3 consecutive weeks after Month 3',
        },
      };
    },
  },
  {
    name: 'Revenue Decline',
    category: 'revenue',
    consecutiveWeeks: 1,
    afterMonth3: false,
    pausedComponent: 'all-outbound',
    check: (rows) => {
      if (rows.length < 2) return null;
      const curr = rows[0].mrr_total ?? 0;
      const prev = rows[1].mrr_total ?? 0;
      if (prev === 0) return null;
      const drop = (prev - curr) / prev;
      if (drop <= 0.15) return null;
      return {
        triggered: true,
        data: {
          current_mrr: curr,
          previous_mrr: prev,
          drop_pct: Number((drop * 100).toFixed(2)),
          threshold: '> 15% week-on-week MRR drop',
        },
      };
    },
  },
  {
    name: 'CAC Inversion',
    category: 'revenue',
    consecutiveWeeks: 2,
    afterMonth3: false,
    pausedComponent: 'paid-ads',
    check: (rows) => {
      if (rows.length < 2) return null;
      const bothExceed = rows.slice(0, 2).every((r) => (r.cac_blended ?? 0) > 1200000);
      if (!bothExceed) return null;
      return {
        triggered: true,
        data: {
          cac_values: rows.slice(0, 2).map((r) => r.cac_blended),
          threshold: '> 1,200,000 paise (₹12,000) for 2 consecutive weeks',
        },
      };
    },
  },
  {
    name: 'Margin Collapse',
    category: 'revenue',
    consecutiveWeeks: 1,
    afterMonth3: false,
    pausedComponent: 'variable-spend',
    check: (rows) => {
      if (rows.length < 1) return null;
      const margin = rows[0].gross_margin_pct;
      if (margin === null || margin === undefined) return null;
      if (Number(margin) >= 60) return null;
      return {
        triggered: true,
        data: {
          gross_margin_pct: Number(margin),
          threshold: '< 60% gross margin',
        },
      };
    },
  },
  {
    name: 'Self-Funding Breach',
    category: 'revenue',
    consecutiveWeeks: 1,
    afterMonth3: true,
    pausedComponent: 'all-variable-spend',
    check: (rows, ctx) => {
      if (!ctx.isAfterMonth3 || rows.length < 1) return null;
      const cost = rows[0].cost_total ?? 0;
      const revenue = rows[0].mrr_total ?? 0;
      if (cost <= revenue) return null;
      return {
        triggered: true,
        data: {
          cost_total: cost,
          mrr_total: revenue,
          deficit: cost - revenue,
          threshold: 'costs > revenue after Month 3',
        },
      };
    },
  },

  // ---- Conversion Breakpoints ----
  {
    name: 'Acquisition Collapse',
    category: 'conversion',
    consecutiveWeeks: 2,
    afterMonth3: false,
    pausedComponent: 'outbound-sequences',
    check: (rows) => {
      if (rows.length < 2) return null;
      const bothLow = rows.slice(0, 2).every((r) => {
        const rate = r.trial_to_paid_rate !== null ? Number(r.trial_to_paid_rate) : null;
        return rate !== null && rate < 0.05;
      });
      if (!bothLow) return null;
      return {
        triggered: true,
        data: {
          rates: rows.slice(0, 2).map((r) => Number(r.trial_to_paid_rate)),
          threshold: 'trial_to_paid_rate < 5% for 2 consecutive weeks',
        },
      };
    },
  },
  {
    name: 'Activation Failure',
    category: 'conversion',
    consecutiveWeeks: 2,
    afterMonth3: false,
    pausedComponent: 'onboarding-sequences',
    check: (rows, ctx) => {
      const failingProducts: string[] = [];
      for (const [product, rate] of Object.entries(ctx.productAhaRates)) {
        if (rate < 0.35) {
          failingProducts.push(product);
        }
      }
      if (failingProducts.length === 0) return null;
      // Also require the aggregate metric to be low for 2 consecutive weeks
      if (rows.length < 2) return null;
      const bothLow = rows.slice(0, 2).every((r) => {
        const rate = r.aha_to_paid_rate !== null ? Number(r.aha_to_paid_rate) : null;
        return rate !== null && rate < 0.35;
      });
      if (!bothLow) return null;
      return {
        triggered: true,
        data: {
          failing_products: failingProducts,
          product_rates: ctx.productAhaRates,
          aggregate_rates: rows.slice(0, 2).map((r) => Number(r.aha_to_paid_rate)),
          threshold: 'aha_to_paid_rate < 35% for 2 consecutive weeks (per product)',
        },
      };
    },
  },
  {
    name: 'Churn Acceleration',
    category: 'conversion',
    consecutiveWeeks: 1,
    afterMonth3: false,
    pausedComponent: 'expansion-campaigns',
    check: (_rows, ctx) => {
      if (ctx.monthlyChurnRates.length < 2) return null;
      const bothHigh = ctx.monthlyChurnRates.slice(0, 2).every((r) => r > 0.08);
      if (!bothHigh) return null;
      return {
        triggered: true,
        data: {
          monthly_churn_rates: ctx.monthlyChurnRates.slice(0, 2).map((r) => Number((r * 100).toFixed(2))),
          threshold: '> 8% monthly churn for 2 consecutive months',
        },
      };
    },
  },

  // ---- Operational Breakpoints ----
  {
    name: 'Email Domain Reputation',
    category: 'operational',
    consecutiveWeeks: 1,
    afterMonth3: false,
    pausedComponent: 'email-outbound',
    check: (rows) => {
      if (rows.length < 1) return null;
      const rate = rows[0].email_bounce_rate !== null ? Number(rows[0].email_bounce_rate) : null;
      if (rate === null || rate <= 0.05) return null;
      return {
        triggered: true,
        data: {
          email_bounce_rate: rate,
          threshold: '> 5% email bounce rate',
        },
      };
    },
  },
  {
    name: 'WhatsApp Opt-Out Spike',
    category: 'operational',
    consecutiveWeeks: 1,
    afterMonth3: false,
    pausedComponent: 'whatsapp-outbound',
    check: (rows) => {
      if (rows.length < 1) return null;
      const rate = rows[0].wa_optout_rate !== null ? Number(rows[0].wa_optout_rate) : null;
      if (rate === null || rate <= 0.02) return null;
      return {
        triggered: true,
        data: {
          wa_optout_rate: rate,
          threshold: '> 2% WhatsApp opt-out rate',
        },
      };
    },
  },
  {
    name: 'LLM Cost Overrun',
    category: 'operational',
    consecutiveWeeks: 1,
    afterMonth3: false,
    pausedComponent: 'llm-powered-features',
    check: (_rows, ctx) => {
      if (ctx.maxDailyTokenSpend <= 250000) return null;
      return {
        triggered: true,
        data: {
          max_daily_token_spend: ctx.maxDailyTokenSpend,
          threshold: '> 250,000 tokens/day (proxy for ₹2,500)',
        },
      };
    },
  },
  {
    name: 'Vapi Call Complaints',
    category: 'operational',
    consecutiveWeeks: 1,
    afterMonth3: false,
    pausedComponent: 'vapi-calls',
    check: (_rows, ctx) => {
      if (ctx.dncComplaintCount <= 5) return null;
      return {
        triggered: true,
        data: {
          dnc_complaints_7d: ctx.dncComplaintCount,
          threshold: '> 5 "do not call" events in 7 days',
        },
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-breakpoint-monitor');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get all orgs that have engine metrics
    const { data: orgRows } = await supabase
      .from('mkt_engine_metrics')
      .select('org_id')
      .eq('period_type', 'weekly');

    const orgIds = [...new Set((orgRows || []).map((r) => r.org_id).filter(Boolean))];

    if (orgIds.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No orgs with weekly metrics', breakpoints_checked: 0, triggered: 0, resolved: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalChecked = 0;
    let totalTriggered = 0;
    let totalResolved = 0;

    for (const orgId of orgIds) {
      try {
        const result = await processOrg(supabase, supabaseUrl, serviceRoleKey, orgId, logger);
        totalChecked += result.checked;
        totalTriggered += result.triggered;
        totalResolved += result.resolved;
      } catch (err) {
        await logger.error('org-processing-failed', err, { org_id: orgId });
      }
    }

    await logger.info('monitor-complete', {
      orgs_processed: orgIds.length,
      breakpoints_checked: totalChecked,
      triggered: totalTriggered,
      resolved: totalResolved,
    });

    return new Response(
      JSON.stringify({
        message: 'Breakpoint monitor complete',
        breakpoints_checked: totalChecked,
        triggered: totalTriggered,
        resolved: totalResolved,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('monitor-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ---------------------------------------------------------------------------
// Per-org processing
// ---------------------------------------------------------------------------

async function processOrg(
  supabase: ReturnType<typeof getSupabaseClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<{ checked: number; triggered: number; resolved: number }> {
  // 1. Fetch latest 3 weekly metric rows
  const { data: weeklyRows } = await supabase
    .from('mkt_engine_metrics')
    .select('*')
    .eq('org_id', orgId)
    .eq('period_type', 'weekly')
    .order('period_end', { ascending: false })
    .limit(3);

  const rows: MetricRow[] = (weeklyRows || []).map((r) => ({
    period_start: r.period_start,
    period_end: r.period_end,
    mrr_total: r.mrr_total,
    mrr_net_movement: r.mrr_net_movement,
    trial_to_paid_rate: r.trial_to_paid_rate,
    aha_to_paid_rate: r.aha_to_paid_rate,
    gross_margin_pct: r.gross_margin_pct,
    cac_blended: r.cac_blended,
    cost_total: r.cost_total,
    email_bounce_rate: r.email_bounce_rate,
    wa_optout_rate: r.wa_optout_rate,
    clients_active: r.clients_active,
    clients_churned: r.clients_churned,
  }));

  if (rows.length === 0) {
    return { checked: 0, triggered: 0, resolved: 0 };
  }

  // 2. Build org context
  const ctx = await buildOrgContext(supabase, orgId, rows);

  // 3. Fetch currently active breakpoints for this org
  const { data: activeBreakpoints } = await supabase
    .from('mkt_engine_logs')
    .select('id, action, paused_component, created_at')
    .eq('org_id', orgId)
    .eq('log_type', 'breakpoint')
    .is('resolved_at', null);

  const activeByName = new Map<string, { id: string; action: string }>();
  for (const bp of activeBreakpoints || []) {
    activeByName.set(bp.action, { id: bp.id, action: bp.action });
  }

  let checked = 0;
  let triggered = 0;
  let resolved = 0;

  // 4. Evaluate each breakpoint definition
  for (const def of BREAKPOINT_DEFS) {
    checked++;

    const result = def.check(rows, ctx);
    const isTriggered = result !== null && result.triggered;
    const isAlreadyActive = activeByName.has(def.name);

    if (isTriggered && !isAlreadyActive) {
      // New breakpoint triggered
      await supabase.from('mkt_engine_logs').insert({
        org_id: orgId,
        function_name: 'mkt-breakpoint-monitor',
        action: def.name,
        level: 'error',
        log_type: 'breakpoint',
        paused_component: def.pausedComponent,
        details: {
          category: def.category,
          ...result!.data,
        },
      });

      // Send alert email to org admins
      await sendBreakpointAlert(
        supabase,
        supabaseUrl,
        serviceRoleKey,
        orgId,
        def,
        result!.data,
      );

      triggered++;
      await logger.warn('breakpoint-triggered', {
        org_id: orgId,
        breakpoint: def.name,
        category: def.category,
        paused_component: def.pausedComponent,
        data: result!.data,
      });
    } else if (!isTriggered && isAlreadyActive) {
      // Auto-resolve: metric is back within acceptable range
      const active = activeByName.get(def.name)!;
      await supabase
        .from('mkt_engine_logs')
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: 'auto',
        })
        .eq('id', active.id);

      resolved++;
      await logger.info('breakpoint-auto-resolved', {
        org_id: orgId,
        breakpoint: def.name,
        log_id: active.id,
      });
    }
  }

  return { checked, triggered, resolved };
}

// ---------------------------------------------------------------------------
// Build org context with supplementary data
// ---------------------------------------------------------------------------

async function buildOrgContext(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  _rows: MetricRow[],
): Promise<OrgContext> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Parallel fetches
  const [orgRes, activationRes, monthlyRes, tokenRes, dncRes] = await Promise.all([
    // Org created_at for Month 3 check
    supabase.from('organizations').select('created_at').eq('id', orgId).single(),

    // Per-product aha-to-paid rates from activation events (last 2 weeks)
    supabase
      .from('mkt_activation_events')
      .select('product_key, event_type')
      .eq('org_id', orgId)
      .gte('occurred_at', new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()),

    // Monthly metrics for churn calculation (last 2 months)
    supabase
      .from('mkt_engine_metrics')
      .select('clients_active, clients_churned, period_end')
      .eq('org_id', orgId)
      .eq('period_type', 'monthly')
      .order('period_end', { ascending: false })
      .limit(2),

    // Token spend from engine logs (last 7 days, grouped by day)
    supabase
      .from('mkt_engine_logs')
      .select('tokens_used, created_at')
      .eq('org_id', orgId)
      .gte('created_at', sevenDaysAgo)
      .not('tokens_used', 'is', null),

    // "do not call" complaints in last 7 days
    supabase
      .from('mkt_engine_logs')
      .select('id')
      .eq('org_id', orgId)
      .ilike('action', '%do not call%')
      .gte('created_at', sevenDaysAgo),
  ]);

  // Org age check
  const orgCreatedAt = orgRes.data?.created_at || now.toISOString();
  const orgAgeMs = now.getTime() - new Date(orgCreatedAt).getTime();
  const isAfterMonth3 = orgAgeMs > 90 * 24 * 60 * 60 * 1000;

  // Per-product aha_to_paid rates
  const productAhaRates: Record<string, number> = {};
  const activationEvents = activationRes.data || [];
  if (activationEvents.length > 0) {
    const productAhas: Record<string, number> = {};
    const productPaids: Record<string, number> = {};

    for (const evt of activationEvents) {
      const key = evt.product_key;
      if (evt.event_type === 'aha_moment') {
        productAhas[key] = (productAhas[key] || 0) + 1;
      } else if (evt.event_type === 'payment_attempted') {
        productPaids[key] = (productPaids[key] || 0) + 1;
      }
    }

    for (const product of Object.keys(productAhas)) {
      const ahas = productAhas[product] || 0;
      const paids = productPaids[product] || 0;
      productAhaRates[product] = ahas > 0 ? paids / ahas : 0;
    }
  }

  // Monthly churn rates
  const monthlyChurnRates: number[] = [];
  for (const m of monthlyRes.data || []) {
    const active = m.clients_active ?? 0;
    const churned = m.clients_churned ?? 0;
    monthlyChurnRates.push(active > 0 ? churned / active : 0);
  }

  // Max daily token spend
  let maxDailyTokenSpend = 0;
  const tokenLogs = tokenRes.data || [];
  if (tokenLogs.length > 0) {
    const dailyTokens: Record<string, number> = {};
    for (const log of tokenLogs) {
      const day = log.created_at.split('T')[0];
      dailyTokens[day] = (dailyTokens[day] || 0) + (log.tokens_used || 0);
    }
    for (const dayTotal of Object.values(dailyTokens)) {
      if (dayTotal > maxDailyTokenSpend) maxDailyTokenSpend = dayTotal;
    }
  }

  // DNC complaint count
  const dncComplaintCount = (dncRes.data || []).length;

  return {
    orgId,
    orgCreatedAt,
    isAfterMonth3,
    productAhaRates,
    monthlyChurnRates,
    maxDailyTokenSpend,
    dncComplaintCount,
  };
}

// ---------------------------------------------------------------------------
// Alert email
// ---------------------------------------------------------------------------

async function sendBreakpointAlert(
  supabase: ReturnType<typeof getSupabaseClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  def: BreakpointDef,
  data: Record<string, unknown>,
): Promise<void> {
  // Fetch org admins
  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('user_id')
    .in('role', ['admin', 'super_admin']);

  const adminUserIds = (roleRows || []).map((r) => r.user_id);
  if (adminUserIds.length === 0) return;

  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .eq('org_id', orgId)
    .in('id', adminUserIds);

  if (!admins || admins.length === 0) return;

  const subject = `[BREAKPOINT] ${def.name} — Action Required`;
  const html = buildBreakpointEmailHtml(def, data);

  for (const admin of admins) {
    if (!admin.email) continue;

    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: admin.email,
          subject,
          html,
        }),
      });

      if (!resp.ok) {
        console.error(`[mkt-breakpoint-monitor] Email send failed for ${admin.email}: ${resp.status}`);
      }
    } catch (err) {
      console.error('[mkt-breakpoint-monitor] Email send error:', err);
    }
  }

  // Mark alert_email_sent_at on the breakpoint log
  await supabase
    .from('mkt_engine_logs')
    .update({ alert_email_sent_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('log_type', 'breakpoint')
    .eq('action', def.name)
    .is('resolved_at', null);
}

function buildBreakpointEmailHtml(def: BreakpointDef, data: Record<string, unknown>): string {
  const categoryColors: Record<string, string> = {
    revenue: '#ef4444',
    conversion: '#f59e0b',
    operational: '#3b82f6',
  };

  const color = categoryColors[def.category] || '#6b7280';

  const dataRows = Object.entries(data)
    .filter(([key]) => key !== 'threshold')
    .map(([key, value]) => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `<tr><td style="padding:6px 12px;font-weight:600;color:#374151;">${label}</td><td style="padding:6px 12px;color:#111827;">${displayValue}</td></tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head><style>
  body { font-family: -apple-system, sans-serif; background: #f9fafb; padding: 20px; margin: 0; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header { background: ${color}; color: white; padding: 24px; }
  .header h1 { margin: 0 0 4px; font-size: 18px; }
  .header p { margin: 0; opacity: 0.9; font-size: 14px; }
  .body { padding: 24px; }
  .section { margin-bottom: 20px; }
  .section h3 { font-size: 14px; color: #374151; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; }
  table tr { border-bottom: 1px solid #f3f4f6; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; background: ${color}22; color: ${color}; }
  .paused { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
  .paused strong { color: #991b1b; }
  .options { background: #f9fafb; border-radius: 8px; padding: 16px; margin-top: 16px; }
  .options h3 { margin-top: 0; }
  .options ol { margin: 8px 0 0; padding-left: 20px; }
  .options li { margin-bottom: 6px; color: #374151; font-size: 14px; }
  .footer { padding: 16px 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>[BREAKPOINT] ${def.name}</h1>
    <p>${def.category.charAt(0).toUpperCase() + def.category.slice(1)} Breakpoint — ${new Date().toISOString().split('T')[0]}</p>
  </div>
  <div class="body">
    <div class="section">
      <h3>What Triggered</h3>
      <p style="margin:0;color:#374151;font-size:14px;">${data.threshold || def.name}</p>
      <span class="badge">${def.category}</span>
    </div>

    <div class="paused">
      <strong>Paused Component:</strong> ${def.pausedComponent}
    </div>

    <div class="section">
      <h3>Data Behind This Alert</h3>
      <table>${dataRows}</table>
    </div>

    <div class="options">
      <h3 style="font-size:14px;color:#374151;">Your Options</h3>
      <ol>
        <li><strong>Acknowledge &amp; investigate</strong> — Review the metrics in the dashboard and identify root cause.</li>
        <li><strong>Override &amp; resume</strong> — If this is expected (e.g. seasonal), manually resolve the breakpoint in the dashboard to resume the paused component.</li>
        <li><strong>Escalate</strong> — Forward this email to your team for a deeper review of the ${def.category} metrics.</li>
      </ol>
    </div>
  </div>
  <div class="footer">
    Sent by In-Sync CRM Revenue Engine &middot; Breakpoint Monitor<br/>
    This breakpoint will auto-resolve when the metric returns to acceptable levels.
  </div>
</div>
</body>
</html>`;
}
