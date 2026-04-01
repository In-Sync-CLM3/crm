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
        await generateAndSendDigest(supabase, supabaseUrl, serviceRoleKey, orgId, logger);
        digestsSent++;
      } catch (err) {
        await logger.error('digest-failed-for-org', err, { org_id: orgId });
      }
    }

    await logger.info('digests-complete', { orgs_processed: orgIds.length, digests_sent: digestsSent });

    return new Response(
      JSON.stringify({ message: 'Daily digests complete', digests_sent: digestsSent }),
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
  logger: ReturnType<typeof createEngineLogger>
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

  // Generate narrative using Sonnet
  const narrative = await generateNarrative(metricsObj, recommendations, campaigns);

  // Upsert digest
  await supabase.from('mkt_daily_digests').upsert(
    {
      org_id: orgId,
      digest_date: today,
      metrics: metricsObj,
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
    const emailHtml = buildDigestEmail(metricsObj, narrative, recommendations, today);

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
            subject: `Revenue Engine Daily Digest — ${today}`,
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
