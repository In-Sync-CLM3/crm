import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLM } from '../_shared/llmClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-daily-digest');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Determine if this is a weekly report (Monday) or daily digest
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // No body is fine — defaults to auto-detect
    }
    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon
    const isWeeklyMode = body.mode === 'weekly' || dayOfWeek === 1;

    // Get all orgs with active campaigns
    const { data: orgs } = await supabase
      .from('mkt_campaigns')
      .select('org_id')
      .eq('status', 'active');

    const orgIds = [...new Set((orgs || []).map((o) => o.org_id))];

    if (orgIds.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No orgs with active campaigns' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let digestsSent = 0;

    for (const orgId of orgIds) {
      try {
        await generateAndSendDigest(supabase, supabaseUrl, serviceRoleKey, orgId, logger, isWeeklyMode);
        digestsSent++;
      } catch (err) {
        await logger.error('digest-failed-for-org', err, { org_id: orgId });
      }
    }

    const digestType = isWeeklyMode ? 'Weekly' : 'Daily';
    await logger.info('digests-complete', { type: digestType, orgs_processed: orgIds.length, digests_sent: digestsSent });

    return new Response(
      JSON.stringify({ message: `${digestType} digests complete`, digests_sent: digestsSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('digest-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function generateAndSendDigest(
  supabase: ReturnType<typeof getSupabaseClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  logger: ReturnType<typeof createEngineLogger>,
  isWeeklyMode: boolean = false
): Promise<void> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  // Gather metrics
  const [
    campaignsRes,
    metricsRes,
    leadsRes,
    actionsRes,
    scoresRes,
    conversionsRes,
  ] = await Promise.all([
    supabase.from('mkt_campaigns').select('id, name, status, campaign_type').eq('org_id', orgId),
    supabase.from('mkt_channel_metrics').select('*').eq('org_id', orgId).eq('metric_date', yesterday),
    supabase.from('mkt_leads').select('id, status, source, total_score').eq('org_id', orgId).gte('created_at', `${yesterday}T00:00:00Z`).lte('created_at', `${today}T00:00:00Z`),
    supabase.from('mkt_sequence_actions').select('channel, status, opened_at, clicked_at, replied_at').eq('org_id', orgId).gte('created_at', `${yesterday}T00:00:00Z`),
    supabase.from('mkt_lead_scores').select('total_score').eq('org_id', orgId).gte('scored_at', `${yesterday}T00:00:00Z`),
    supabase.from('mkt_leads').select('id').eq('org_id', orgId).eq('status', 'converted').gte('converted_at', `${yesterday}T00:00:00Z`),
  ]);

  const campaigns = campaignsRes.data || [];
  const metrics = metricsRes.data || [];
  const newLeads = leadsRes.data || [];
  const actions = actionsRes.data || [];
  const scores = scoresRes.data || [];
  const conversions = conversionsRes.data || [];

  // Build metrics summary
  const metricsObj = {
    campaigns_active: campaigns.filter((c) => c.status === 'active').length,
    campaigns_total: campaigns.length,
    leads_sourced: newLeads.length,
    leads_scored: scores.length,
    leads_converted: conversions.length,
    emails_sent: actions.filter((a) => a.channel === 'email').length,
    emails_opened: actions.filter((a) => a.channel === 'email' && a.opened_at).length,
    emails_clicked: actions.filter((a) => a.channel === 'email' && a.clicked_at).length,
    whatsapp_sent: actions.filter((a) => a.channel === 'whatsapp').length,
    calls_made: actions.filter((a) => a.channel === 'call').length,
    total_replies: actions.filter((a) => a.replied_at).length,
    avg_lead_score: scores.length > 0
      ? Math.round(scores.reduce((s, sc) => s + (sc.total_score || 0), 0) / scores.length)
      : 0,
    lead_sources: Object.entries(
      newLeads.reduce((acc: Record<string, number>, l) => {
        acc[l.source || 'unknown'] = (acc[l.source || 'unknown'] || 0) + 1;
        return acc;
      }, {})
    ),
  };

  // Get existing recommendations (from optimizer)
  const { data: existingDigest } = await supabase
    .from('mkt_daily_digests')
    .select('recommendations')
    .eq('org_id', orgId)
    .eq('digest_date', today)
    .single();

  const recommendations = (existingDigest?.recommendations as Array<Record<string, unknown>>) || [];

  let narrative: string;
  let emailSubject: string;
  let weeklyData: Record<string, unknown> | null = null;

  if (isWeeklyMode) {
    // --- Weekly mode: collect additional metrics ---
    weeklyData = await collectWeeklyData(supabase, orgId);
    narrative = await generateWeeklyNarrative(metricsObj, weeklyData, recommendations, campaigns);
    // Get org name for subject line
    const { data: orgProfile } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();
    const orgName = orgProfile?.name || 'Your Org';
    emailSubject = `Monday Revenue Report — ${orgName} — Week of ${today}`;
  } else {
    // --- Daily mode: existing narrative ---
    narrative = await generateNarrative(metricsObj, recommendations, campaigns);
    emailSubject = `Revenue Engine Daily Digest — ${today}`;
  }

  // Upsert digest
  await supabase.from('mkt_daily_digests').upsert(
    {
      org_id: orgId,
      digest_date: today,
      metrics: isWeeklyMode ? { ...metricsObj, weekly: weeklyData } : metricsObj,
      narrative,
      recommendations,
    },
    { onConflict: 'org_id,digest_date' }
  );

  // Email digest to org admins
  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .eq('org_id', orgId)
    .in('id', (
      await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'super_admin'])
    ).data?.map((r) => r.user_id) || []);

  if (admins && admins.length > 0) {
    const emailHtml = isWeeklyMode
      ? buildWeeklyReportEmail(metricsObj, weeklyData!, narrative, recommendations, today)
      : buildDigestEmail(metricsObj, narrative, recommendations, today);

    for (const admin of admins) {
      if (!admin.email) continue;

      try {
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: admin.email,
            subject: emailSubject,
            html: emailHtml,
          }),
        });
      } catch (err) {
        console.error('[mkt-daily-digest] Email send failed:', err);
      }
    }

    await supabase
      .from('mkt_daily_digests')
      .update({
        emailed_to: admins.map((a) => a.email).filter(Boolean),
        emailed_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('digest_date', today);
  }
}

// --- Weekly data collection ---
async function collectWeeklyData(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string
): Promise<Record<string, unknown>> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // MRR from mkt_mrr table
  const { data: mrrData } = await supabase
    .from('mkt_mrr')
    .select('mrr_paise')
    .eq('org_id', orgId)
    .eq('is_active', true);

  const currentMrrPaise = (mrrData || []).reduce((sum, r) => sum + ((r.mrr_paise as number) || 0), 0);
  const currentMrr = currentMrrPaise / 100; // Convert paise to rupees

  // Milestone status from mkt_milestones
  const { data: milestones } = await supabase
    .from('mkt_milestones')
    .select('name, target_value, current_value, status, target_date')
    .eq('org_id', orgId);

  const milestonesReached = (milestones || []).filter((m) => m.status === 'reached');
  const milestonesPending = (milestones || []).filter((m) => m.status !== 'reached');

  // Attention items: at-risk leads
  const { data: atRiskLeads } = await supabase
    .from('mkt_leads')
    .select('id, name, company, status')
    .eq('org_id', orgId)
    .eq('at_risk', true);

  // Missed callbacks in last 7 days
  const { data: missedCallbacks } = await supabase
    .from('mkt_sequence_actions')
    .select('lead_id, scheduled_at')
    .eq('org_id', orgId)
    .eq('channel', 'call')
    .eq('status', 'missed')
    .gte('scheduled_at', sevenDaysAgo);

  // Breakpoint alerts in last 7 days
  const { data: breakpointAlerts } = await supabase
    .from('mkt_engine_logs')
    .select('event, metadata, created_at')
    .eq('org_id', orgId)
    .eq('event', 'breakpoint-alert')
    .gte('created_at', sevenDaysAgo);

  // This week vs last week metrics for trajectory
  const { data: thisWeekMetrics } = await supabase
    .from('mkt_channel_metrics')
    .select('sends, opens, clicks, replies, conversions, spend_paise')
    .eq('org_id', orgId)
    .gte('metric_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  const { data: lastWeekMetrics } = await supabase
    .from('mkt_channel_metrics')
    .select('sends, opens, clicks, replies, conversions, spend_paise')
    .eq('org_id', orgId)
    .gte('metric_date', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .lt('metric_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  const sumMetrics = (rows: Array<Record<string, unknown>> | null) => ({
    sends: (rows || []).reduce((s, m) => s + ((m.sends as number) || 0), 0),
    opens: (rows || []).reduce((s, m) => s + ((m.opens as number) || 0), 0),
    clicks: (rows || []).reduce((s, m) => s + ((m.clicks as number) || 0), 0),
    replies: (rows || []).reduce((s, m) => s + ((m.replies as number) || 0), 0),
    conversions: (rows || []).reduce((s, m) => s + ((m.conversions as number) || 0), 0),
    spend_paise: (rows || []).reduce((s, m) => s + ((m.spend_paise as number) || 0), 0),
  });

  const thisWeekTotals = sumMetrics(thisWeekMetrics);
  const lastWeekTotals = sumMetrics(lastWeekMetrics);

  return {
    mrr: currentMrr,
    mrr_paise: currentMrrPaise,
    milestones_reached: milestonesReached,
    milestones_pending: milestonesPending,
    at_risk_leads: atRiskLeads || [],
    missed_callbacks: (missedCallbacks || []).length,
    breakpoint_alerts: (breakpointAlerts || []).length,
    this_week: thisWeekTotals,
    last_week: lastWeekTotals,
  };
}

// --- Weekly narrative generation ---
async function generateWeeklyNarrative(
  dailyMetrics: Record<string, unknown>,
  weeklyData: Record<string, unknown>,
  recommendations: Array<Record<string, unknown>>,
  campaigns: Array<Record<string, unknown>>
): Promise<string> {
  const thisWeek = weeklyData.this_week as Record<string, number>;
  const lastWeek = weeklyData.last_week as Record<string, number>;
  const milestonesReached = weeklyData.milestones_reached as Array<Record<string, unknown>>;
  const milestonesPending = weeklyData.milestones_pending as Array<Record<string, unknown>>;
  const atRiskLeads = weeklyData.at_risk_leads as Array<Record<string, unknown>>;

  const prompt = `Generate a Monday Revenue Report with these sections:
1. MRR HEADLINE: Current MRR, week-over-week change, trajectory
2. PERFORMANCE SUMMARY: Key metrics from last 7 days
3. ATTENTION REQUIRED: Items that need founder review (at-risk clients, missed callbacks)
4. MILESTONE PROGRESS: Which milestones are reached, what's next, how far away
5. THIS WEEK'S PLAN: What the engine will focus on this week

DATA:
Current MRR: ₹${weeklyData.mrr}
Active Campaigns: ${campaigns.filter((c) => c.status === 'active').map((c) => c.name).join(', ') || 'None'}

THIS WEEK METRICS: ${JSON.stringify(thisWeek, null, 2)}
LAST WEEK METRICS: ${JSON.stringify(lastWeek, null, 2)}

AT-RISK LEADS (${atRiskLeads.length}): ${atRiskLeads.map((l) => `${l.name} (${l.company})`).join(', ') || 'None'}
MISSED CALLBACKS: ${weeklyData.missed_callbacks}
BREAKPOINT ALERTS: ${weeklyData.breakpoint_alerts}

MILESTONES REACHED: ${milestonesReached.length > 0 ? milestonesReached.map((m) => m.name).join(', ') : 'None yet'}
MILESTONES PENDING: ${milestonesPending.length > 0 ? milestonesPending.map((m) => `${m.name} (${m.current_value}/${m.target_value}, due ${m.target_date})`).join(', ') : 'None set'}

OPTIMIZER RECOMMENDATIONS:
${recommendations.length > 0 ? recommendations.map((r) => `- [${r.priority}] ${r.recommendation}`).join('\n') : 'No recommendations this week.'}

YESTERDAY'S SNAPSHOT: ${JSON.stringify(dailyMetrics, null, 2)}

Write in a professional but direct tone. Use exact numbers. Be honest about trajectory — if metrics are declining, say so clearly. End with 3-5 concrete priorities for this week.`;

  try {
    const response = await callLLM(prompt, {
      model: 'sonnet',
      max_tokens: 1024,
      temperature: 0.4,
    });
    return response.content;
  } catch {
    return `Weekly Report: MRR ₹${weeklyData.mrr}. This week: ${thisWeek.sends} sends, ${thisWeek.conversions} conversions. ${atRiskLeads.length} at-risk leads. ${weeklyData.missed_callbacks} missed callbacks. Check dashboard for full details.`;
  }
}

// --- Weekly report email template ---
function buildWeeklyReportEmail(
  metrics: Record<string, unknown>,
  weeklyData: Record<string, unknown>,
  narrative: string,
  recommendations: Array<Record<string, unknown>>,
  date: string
): string {
  const thisWeek = weeklyData.this_week as Record<string, number>;
  const lastWeek = weeklyData.last_week as Record<string, number>;
  const pctChange = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : 'N/A';
  const atRiskLeads = weeklyData.at_risk_leads as Array<Record<string, unknown>>;
  const milestonesReached = weeklyData.milestones_reached as Array<Record<string, unknown>>;
  const milestonesPending = weeklyData.milestones_pending as Array<Record<string, unknown>>;

  return `<!DOCTYPE html>
<html>
<head><style>
  body { font-family: -apple-system, sans-serif; background: #f9fafb; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #7c3aed, #2563eb); color: white; padding: 24px; }
  .header h1 { margin: 0 0 4px; font-size: 20px; }
  .header p { margin: 0; opacity: 0.8; font-size: 14px; }
  .mrr-banner { background: #f0fdf4; padding: 20px; text-align: center; border-bottom: 1px solid #e5e7eb; }
  .mrr-value { font-size: 32px; font-weight: 800; color: #16a34a; }
  .mrr-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-top: 4px; }
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 20px; }
  .metric { text-align: center; padding: 12px; background: #f9fafb; border-radius: 8px; }
  .metric .value { font-size: 20px; font-weight: 700; color: #111827; }
  .metric .change { font-size: 11px; margin-top: 2px; }
  .change-up { color: #16a34a; }
  .change-down { color: #dc2626; }
  .metric .label { font-size: 11px; color: #6b7280; text-transform: uppercase; margin-top: 2px; }
  .narrative { padding: 0 20px 20px; color: #374151; line-height: 1.6; font-size: 14px; }
  .section { padding: 0 20px 16px; }
  .section h3 { font-size: 14px; margin: 0 0 8px; color: #111827; }
  .alert-item { padding: 8px 12px; margin-bottom: 6px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px; font-size: 13px; color: #991b1b; }
  .milestone { padding: 8px 12px; margin-bottom: 6px; border-radius: 4px; font-size: 13px; }
  .milestone-reached { background: #f0fdf4; border-left: 3px solid #16a34a; color: #166534; }
  .milestone-pending { background: #eff6ff; border-left: 3px solid #3b82f6; color: #1e40af; }
  .recs { padding: 0 20px 20px; }
  .rec { padding: 8px 12px; margin-bottom: 8px; border-left: 3px solid; border-radius: 4px; font-size: 13px; }
  .rec-high { border-color: #ef4444; background: #fef2f2; }
  .rec-medium { border-color: #f59e0b; background: #fffbeb; }
  .rec-low { border-color: #3b82f6; background: #eff6ff; }
  .footer { padding: 16px 20px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>Monday Revenue Report</h1>
    <p>Week of ${date}</p>
  </div>
  <div class="mrr-banner">
    <div class="mrr-label">Current MRR</div>
    <div class="mrr-value">\u20B9${Number(weeklyData.mrr).toLocaleString('en-IN')}</div>
  </div>
  <div class="metrics">
    <div class="metric">
      <div class="value">${thisWeek.sends}</div>
      <div class="change ${thisWeek.sends >= lastWeek.sends ? 'change-up' : 'change-down'}">${pctChange(thisWeek.sends, lastWeek.sends)}% WoW</div>
      <div class="label">Sends</div>
    </div>
    <div class="metric">
      <div class="value">${thisWeek.opens}</div>
      <div class="change ${thisWeek.opens >= lastWeek.opens ? 'change-up' : 'change-down'}">${pctChange(thisWeek.opens, lastWeek.opens)}% WoW</div>
      <div class="label">Opens</div>
    </div>
    <div class="metric">
      <div class="value">${thisWeek.conversions}</div>
      <div class="change ${thisWeek.conversions >= lastWeek.conversions ? 'change-up' : 'change-down'}">${pctChange(thisWeek.conversions, lastWeek.conversions)}% WoW</div>
      <div class="label">Conversions</div>
    </div>
    <div class="metric">
      <div class="value">${thisWeek.replies}</div>
      <div class="change ${thisWeek.replies >= lastWeek.replies ? 'change-up' : 'change-down'}">${pctChange(thisWeek.replies, lastWeek.replies)}% WoW</div>
      <div class="label">Replies</div>
    </div>
    <div class="metric">
      <div class="value">${(weeklyData.missed_callbacks as number) || 0}</div>
      <div class="label">Missed Callbacks</div>
    </div>
    <div class="metric">
      <div class="value">${(weeklyData.breakpoint_alerts as number) || 0}</div>
      <div class="label">Alerts</div>
    </div>
  </div>
  <div class="narrative">${narrative.split('\n').map((p) => `<p>${p}</p>`).join('')}</div>
  ${atRiskLeads.length > 0 ? `
  <div class="section">
    <h3>Attention Required</h3>
    ${atRiskLeads.map((l) => `<div class="alert-item">${l.name} (${l.company}) — ${l.status}</div>`).join('')}
  </div>` : ''}
  ${(milestonesReached.length > 0 || milestonesPending.length > 0) ? `
  <div class="section">
    <h3>Milestone Progress</h3>
    ${milestonesReached.map((m) => `<div class="milestone milestone-reached">Reached: ${m.name}</div>`).join('')}
    ${milestonesPending.map((m) => `<div class="milestone milestone-pending">${m.name}: ${m.current_value}/${m.target_value} (due ${m.target_date})</div>`).join('')}
  </div>` : ''}
  ${recommendations.length > 0 ? `
  <div class="recs">
    <h3 style="font-size: 14px; margin-bottom: 8px;">Recommendations</h3>
    ${recommendations.map((r) => `<div class="rec rec-${r.priority}">${r.recommendation}</div>`).join('')}
  </div>` : ''}
  <div class="footer">Sent by In-Sync CRM Revenue Engine</div>
</div>
</body>
</html>`;
}

async function generateNarrative(
  metrics: Record<string, unknown>,
  recommendations: Array<Record<string, unknown>>,
  campaigns: Array<Record<string, unknown>>
): Promise<string> {
  const prompt = `Write a brief (3-5 paragraph) daily performance narrative for a revenue engine. Be direct and data-driven. Highlight wins and concerns.

YESTERDAY'S METRICS:
${JSON.stringify(metrics, null, 2)}

ACTIVE CAMPAIGNS: ${campaigns.filter((c) => c.status === 'active').map((c) => c.name).join(', ') || 'None'}

OPTIMIZER RECOMMENDATIONS:
${recommendations.length > 0 ? recommendations.map((r) => `- [${r.priority}] ${r.recommendation}`).join('\n') : 'No recommendations today.'}

Write the narrative in a professional but conversational tone. Use numbers. End with 1-2 action items for the day.`;

  try {
    const response = await callLLM(prompt, {
      model: 'sonnet',
      max_tokens: 512,
      temperature: 0.4,
    });
    return response.content;
  } catch {
    return `Yesterday: ${metrics.leads_sourced} leads sourced, ${metrics.emails_sent} emails sent, ${metrics.leads_converted} converted. Check dashboard for details.`;
  }
}

function buildDigestEmail(
  metrics: Record<string, unknown>,
  narrative: string,
  recommendations: Array<Record<string, unknown>>,
  date: string
): string {
  return `<!DOCTYPE html>
<html>
<head><style>
  body { font-family: -apple-system, sans-serif; background: #f9fafb; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 24px; }
  .header h1 { margin: 0 0 4px; font-size: 20px; }
  .header p { margin: 0; opacity: 0.8; font-size: 14px; }
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 20px; }
  .metric { text-align: center; padding: 12px; background: #f9fafb; border-radius: 8px; }
  .metric .value { font-size: 24px; font-weight: 700; color: #111827; }
  .metric .label { font-size: 11px; color: #6b7280; text-transform: uppercase; margin-top: 2px; }
  .narrative { padding: 0 20px 20px; color: #374151; line-height: 1.6; font-size: 14px; }
  .recs { padding: 0 20px 20px; }
  .rec { padding: 8px 12px; margin-bottom: 8px; border-left: 3px solid; border-radius: 4px; font-size: 13px; }
  .rec-high { border-color: #ef4444; background: #fef2f2; }
  .rec-medium { border-color: #f59e0b; background: #fffbeb; }
  .rec-low { border-color: #3b82f6; background: #eff6ff; }
  .footer { padding: 16px 20px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>Revenue Engine Daily Digest</h1>
    <p>${date}</p>
  </div>
  <div class="metrics">
    <div class="metric"><div class="value">${metrics.leads_sourced}</div><div class="label">Leads Sourced</div></div>
    <div class="metric"><div class="value">${metrics.emails_sent}</div><div class="label">Emails Sent</div></div>
    <div class="metric"><div class="value">${metrics.leads_converted}</div><div class="label">Converted</div></div>
    <div class="metric"><div class="value">${metrics.total_replies}</div><div class="label">Replies</div></div>
    <div class="metric"><div class="value">${metrics.avg_lead_score}</div><div class="label">Avg Score</div></div>
    <div class="metric"><div class="value">${metrics.campaigns_active}</div><div class="label">Active Campaigns</div></div>
  </div>
  <div class="narrative">${narrative.split('\n').map((p) => `<p>${p}</p>`).join('')}</div>
  ${recommendations.length > 0 ? `
  <div class="recs">
    <h3 style="font-size: 14px; margin-bottom: 8px;">Recommendations</h3>
    ${recommendations.map((r) => `<div class="rec rec-${r.priority}">${r.recommendation}</div>`).join('')}
  </div>` : ''}
  <div class="footer">Sent by In-Sync CRM Revenue Engine</div>
</div>
</body>
</html>`;
}
