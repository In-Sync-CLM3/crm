import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLMJson } from '../_shared/llmClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptimizationRecommendation {
  campaign_id: string;
  campaign_name: string;
  type: 'timing' | 'messaging' | 'channel_mix' | 'budget' | 'audience' | 'pause' | 'content' | 'channel_allocation' | 'icp';
  priority: 'high' | 'medium' | 'low';
  recommendation: string;
  reasoning: string;
  auto_applied: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-campaign-optimizer');

  try {
    const supabase = getSupabaseClient();

    // Get all active campaigns with their metrics
    const { data: campaigns, error } = await supabase
      .from('mkt_campaigns')
      .select('id, org_id, name, campaign_type, start_date, budget, budget_spent')
      .eq('status', 'active');

    if (error) throw error;
    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active campaigns to optimize' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logger.info('optimizer-start', { campaign_count: campaigns.length });

    const allRecommendations: OptimizationRecommendation[] = [];

    // Process each campaign's org
    const orgIds = [...new Set(campaigns.map((c) => c.org_id))];

    for (const orgId of orgIds) {
      const orgCampaigns = campaigns.filter((c) => c.org_id === orgId);

      // Fetch metrics for all campaigns in this org (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: metrics } = await supabase
        .from('mkt_channel_metrics')
        .select('*')
        .eq('org_id', orgId)
        .gte('metric_date', sevenDaysAgo);

      // Fetch enrollment/action stats
      const campaignIds = orgCampaigns.map((c) => c.id);

      const { data: enrollmentStats } = await supabase
        .from('mkt_sequence_enrollments')
        .select('campaign_id, status')
        .in('campaign_id', campaignIds);

      const { data: actionStats } = await supabase
        .from('mkt_sequence_actions')
        .select('channel, status, opened_at, clicked_at, replied_at, org_id')
        .eq('org_id', orgId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      // Build performance summary for Sonnet
      const performanceSummary = buildPerformanceSummary(
        orgCampaigns,
        metrics || [],
        enrollmentStats || [],
        actionStats || []
      );

      // Get optimization recommendations from Sonnet
      const recommendations = await getOptimizationRecommendations(orgCampaigns, performanceSummary);
      allRecommendations.push(...recommendations);

      // Auto-apply safe optimizations
      for (const rec of recommendations) {
        if (rec.type === 'pause' && rec.priority === 'high') {
          // Auto-pause campaigns with consistently poor performance
          await supabase
            .from('mkt_campaigns')
            .update({ status: 'paused' })
            .eq('id', rec.campaign_id);
          rec.auto_applied = true;

          await logger.warn('auto-paused-campaign', {
            campaign_id: rec.campaign_id,
            reason: rec.reasoning,
          });
        }
      }

      // --- Run additional optimization modules ---
      const sevenDaysAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [contentRecs, channelRecs, icpRecs] = await Promise.all([
        analyzeContentPerformance(supabase, orgId, sevenDaysAgoISO, logger),
        optimizeChannelAllocation(supabase, orgId, logger),
        refineICP(supabase, orgId, sevenDaysAgoISO, logger),
      ]);

      allRecommendations.push(...contentRecs, ...channelRecs, ...icpRecs);

      // Store all recommendations (campaign + content + channel + ICP) in daily digest
      await supabase.from('mkt_daily_digests').upsert(
        {
          org_id: orgId,
          digest_date: new Date().toISOString().split('T')[0],
          recommendations: allRecommendations.filter((r) =>
            orgCampaigns.some((c) => c.id === r.campaign_id) ||
            ['content', 'channel_allocation', 'icp'].includes(r.type)
          ),
        },
        { onConflict: 'org_id,digest_date' }
      );

      // Log module results to engine logs
      await supabase.from('mkt_engine_logs').insert({
        org_id: orgId,
        function_name: 'mkt-campaign-optimizer',
        event: 'modules-complete',
        metadata: {
          content_recs: contentRecs.length,
          channel_recs: channelRecs.length,
          icp_recs: icpRecs.length,
        },
      });
    }

    await logger.info('optimizer-complete', {
      recommendations_count: allRecommendations.length,
      auto_applied: allRecommendations.filter((r) => r.auto_applied).length,
    });

    return new Response(
      JSON.stringify({
        message: 'Campaign optimization complete',
        recommendations: allRecommendations.length,
        auto_applied: allRecommendations.filter((r) => r.auto_applied).length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('optimizer-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildPerformanceSummary(
  campaigns: Array<Record<string, unknown>>,
  metrics: Array<Record<string, unknown>>,
  enrollments: Array<Record<string, unknown>>,
  actions: Array<Record<string, unknown>>
): string {
  const lines: string[] = [];

  for (const campaign of campaigns) {
    const campMetrics = metrics.filter((m) => m.campaign_id === campaign.id);
    const campEnrollments = enrollments.filter((e) => e.campaign_id === campaign.id);

    const totalSends = campMetrics.reduce((s, m) => s + ((m.sends as number) || 0), 0);
    const totalOpens = campMetrics.reduce((s, m) => s + ((m.opens as number) || 0), 0);
    const totalClicks = campMetrics.reduce((s, m) => s + ((m.clicks as number) || 0), 0);
    const totalReplies = campMetrics.reduce((s, m) => s + ((m.replies as number) || 0), 0);
    const totalBounces = campMetrics.reduce((s, m) => s + ((m.bounces as number) || 0), 0);
    const totalUnsubs = campMetrics.reduce((s, m) => s + ((m.unsubscribes as number) || 0), 0);

    const activeEnrollments = campEnrollments.filter((e) => e.status === 'active').length;
    const completedEnrollments = campEnrollments.filter((e) => e.status === 'completed').length;

    lines.push(`Campaign: ${campaign.name} (${campaign.campaign_type})`);
    lines.push(`  Budget: ${campaign.budget_spent || 0}/${campaign.budget || 'unlimited'} ${campaign.start_date ? `since ${campaign.start_date}` : ''}`);
    lines.push(`  Enrollments: ${activeEnrollments} active, ${completedEnrollments} completed`);
    lines.push(`  7-day sends: ${totalSends}, opens: ${totalOpens} (${totalSends > 0 ? (totalOpens / totalSends * 100).toFixed(1) : 0}%), clicks: ${totalClicks}, replies: ${totalReplies}`);
    lines.push(`  Bounces: ${totalBounces}, Unsubscribes: ${totalUnsubs}`);
    lines.push('');
  }

  // Channel breakdown
  const channelSummary: Record<string, { sends: number; opens: number; clicks: number; replies: number }> = {};
  for (const action of actions) {
    const ch = action.channel as string;
    if (!channelSummary[ch]) channelSummary[ch] = { sends: 0, opens: 0, clicks: 0, replies: 0 };
    channelSummary[ch].sends++;
    if (action.opened_at) channelSummary[ch].opens++;
    if (action.clicked_at) channelSummary[ch].clicks++;
    if (action.replied_at) channelSummary[ch].replies++;
  }

  lines.push('Channel performance (7 days):');
  for (const [ch, stats] of Object.entries(channelSummary)) {
    lines.push(`  ${ch}: ${stats.sends} sent, ${stats.opens} opened, ${stats.clicks} clicked, ${stats.replies} replied`);
  }

  return lines.join('\n');
}

async function getOptimizationRecommendations(
  campaigns: Array<Record<string, unknown>>,
  performanceSummary: string
): Promise<OptimizationRecommendation[]> {
  const prompt = `You are a marketing campaign optimizer. Analyze this campaign performance and provide actionable recommendations.

PERFORMANCE DATA:
${performanceSummary}

For each recommendation, return JSON array:
[
  {
    "campaign_id": "uuid",
    "campaign_name": "name",
    "type": "timing|messaging|channel_mix|budget|audience|pause",
    "priority": "high|medium|low",
    "recommendation": "Specific action to take",
    "reasoning": "Why this will help, based on the data"
  }
]

RULES:
- Only recommend "pause" for campaigns with >5% bounce rate or >2% unsubscribe rate or 0% engagement over 7 days
- Focus on actionable, data-driven insights
- Max 5 recommendations total
- If everything looks healthy, return an empty array []`;

  try {
    const { data } = await callLLMJson<OptimizationRecommendation[]>(prompt, {
      model: 'sonnet',
      max_tokens: 1024,
      temperature: 0.2,
    });

    // Validate and enrich with auto_applied flag
    return (Array.isArray(data) ? data : []).map((r) => ({
      ...r,
      auto_applied: false,
      // Ensure campaign_id is valid
      campaign_id: campaigns.find((c) => c.id === r.campaign_id || c.name === r.campaign_name)?.id as string || r.campaign_id,
    }));
  } catch (error) {
    console.error('[mkt-campaign-optimizer] LLM recommendation failed:', error);
    return [];
  }
}

// =============================================================================
// MODULE A: Content Optimization — analyze template performance
// =============================================================================
async function analyzeContentPerformance(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  since: string,
  logger: ReturnType<typeof createEngineLogger>
): Promise<OptimizationRecommendation[]> {
  try {
    // Content optimization: analyze template performance
    const { data: templateStats } = await supabase
      .from('mkt_sequence_actions')
      .select('metadata, status, opened_at, clicked_at, replied_at')
      .eq('org_id', orgId)
      .eq('channel', 'email')
      .gte('created_at', since);

    if (!templateStats || templateStats.length === 0) return [];

    // Group by template_id from metadata, calculate open/click rates per template
    const templatePerf: Record<string, { sent: number; opened: number; clicked: number; replied: number; template_name: string }> = {};

    for (const action of templateStats) {
      const meta = action.metadata as Record<string, unknown> | null;
      const templateId = (meta?.template_id as string) || 'unknown';
      const templateName = (meta?.template_name as string) || templateId;

      if (!templatePerf[templateId]) {
        templatePerf[templateId] = { sent: 0, opened: 0, clicked: 0, replied: 0, template_name: templateName };
      }
      templatePerf[templateId].sent++;
      if (action.opened_at) templatePerf[templateId].opened++;
      if (action.clicked_at) templatePerf[templateId].clicked++;
      if (action.replied_at) templatePerf[templateId].replied++;
    }

    // Only analyze templates with enough data (min 5 sends)
    const templatesWithData = Object.entries(templatePerf)
      .filter(([_, stats]) => stats.sent >= 5)
      .map(([id, stats]) => ({
        template_id: id,
        template_name: stats.template_name,
        sent: stats.sent,
        open_rate: (stats.opened / stats.sent * 100).toFixed(1),
        click_rate: (stats.clicked / stats.sent * 100).toFixed(1),
        reply_rate: (stats.replied / stats.sent * 100).toFixed(1),
      }));

    if (templatesWithData.length === 0) return [];

    // Sort by open rate ascending to find worst performers
    templatesWithData.sort((a, b) => parseFloat(a.open_rate) - parseFloat(b.open_rate));

    // Feed worst-performing templates to Sonnet for rewrite suggestions
    const worstTemplates = templatesWithData.slice(0, 3);

    const prompt = `You are an email marketing expert. These email templates are underperforming. Suggest specific improvements.

TEMPLATE PERFORMANCE (worst first):
${worstTemplates.map((t) => `- "${t.template_name}": ${t.sent} sent, ${t.open_rate}% open, ${t.click_rate}% click, ${t.reply_rate}% reply`).join('\n')}

ALL TEMPLATES FOR COMPARISON:
${templatesWithData.map((t) => `- "${t.template_name}": ${t.open_rate}% open, ${t.click_rate}% click, ${t.reply_rate}% reply`).join('\n')}

Return a JSON array of recommendations:
[{
  "campaign_id": "content-optimization",
  "campaign_name": "template_name",
  "type": "content",
  "priority": "high|medium|low",
  "recommendation": "Specific rewrite suggestion or improvement",
  "reasoning": "Why this will improve performance"
}]

Rules:
- Max 3 recommendations
- Focus on subject lines, CTAs, and email length
- Be specific with suggestions, not generic`;

    const { data } = await callLLMJson<OptimizationRecommendation[]>(prompt, {
      model: 'sonnet',
      max_tokens: 768,
      temperature: 0.3,
    });

    const recs = (Array.isArray(data) ? data : []).map((r) => ({
      ...r,
      type: 'content' as const,
      auto_applied: false,
    }));

    await logger.info('content-optimization-complete', {
      org_id: orgId,
      templates_analyzed: templatesWithData.length,
      recommendations: recs.length,
    });

    return recs;
  } catch (error) {
    console.error('[mkt-campaign-optimizer] Content optimization failed:', error);
    return [];
  }
}

// =============================================================================
// MODULE B: Channel Allocation — ROAS-based reallocation
// =============================================================================
async function optimizeChannelAllocation(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  logger: ReturnType<typeof createEngineLogger>
): Promise<OptimizationRecommendation[]> {
  try {
    // Channel allocation optimization
    const { data: channelSpend } = await supabase
      .from('mkt_budget_allocation')
      .select('*')
      .eq('org_id', orgId)
      .order('period_start', { ascending: false })
      .limit(10);

    if (!channelSpend || channelSpend.length === 0) return [];

    // Calculate ROAS per channel
    const channelROAS: Record<string, { total_spend: number; total_revenue: number; allocations: number }> = {};

    for (const alloc of channelSpend) {
      const channel = alloc.channel as string;
      if (!channelROAS[channel]) {
        channelROAS[channel] = { total_spend: 0, total_revenue: 0, allocations: 0 };
      }
      channelROAS[channel].total_spend += (alloc.amount_paise as number) || 0;
      channelROAS[channel].total_revenue += (alloc.revenue_paise as number) || 0;
      channelROAS[channel].allocations++;
    }

    const channelSummary = Object.entries(channelROAS).map(([channel, stats]) => ({
      channel,
      spend: stats.total_spend / 100,
      revenue: stats.total_revenue / 100,
      roas: stats.total_spend > 0 ? (stats.total_revenue / stats.total_spend).toFixed(2) : '0',
      periods: stats.allocations,
    }));

    const totalSpend = channelSummary.reduce((s, c) => s + c.spend, 0);

    // Enforce hard constraints and build recommendations
    const prompt = `You are a media buying optimizer. Analyze this channel spend data and recommend budget reallocation.

CHANNEL PERFORMANCE:
${channelSummary.map((c) => `- ${c.channel}: ₹${c.spend.toFixed(0)} spent, ₹${c.revenue.toFixed(0)} revenue, ROAS ${c.roas}x (${c.periods} periods)`).join('\n')}

Total spend: ₹${totalSpend.toFixed(0)}

HARD CONSTRAINTS:
- Maximum 60% of total budget to any single channel
- Minimum ₹2000 to any active paid channel
- Never allocate to channels with ROAS < 0.5x unless they have < 3 periods of data

Return a JSON array of recommendations:
[{
  "campaign_id": "channel-allocation",
  "campaign_name": "channel_name",
  "type": "channel_allocation",
  "priority": "high|medium|low",
  "recommendation": "Specific reallocation action",
  "reasoning": "ROAS-based reasoning"
}]

Rules:
- Max 3 recommendations
- Include specific ₹ amounts to shift
- Flag any constraint violations in current allocation`;

    const { data } = await callLLMJson<OptimizationRecommendation[]>(prompt, {
      model: 'sonnet',
      max_tokens: 768,
      temperature: 0.2,
    });

    const recs = (Array.isArray(data) ? data : []).map((r) => ({
      ...r,
      type: 'channel_allocation' as const,
      auto_applied: false,
    }));

    await logger.info('channel-allocation-complete', {
      org_id: orgId,
      channels_analyzed: channelSummary.length,
      recommendations: recs.length,
    });

    return recs;
  } catch (error) {
    console.error('[mkt-campaign-optimizer] Channel allocation optimization failed:', error);
    return [];
  }
}

// =============================================================================
// MODULE C: ICP Refinement — analyze which lead characteristics convert best
// =============================================================================
async function refineICP(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  since: string,
  logger: ReturnType<typeof createEngineLogger>
): Promise<OptimizationRecommendation[]> {
  try {
    // ICP refinement: analyze which lead characteristics convert best
    const { data: convertedLeads } = await supabase
      .from('mkt_leads')
      .select('industry, company_size, job_title, source, total_score')
      .eq('org_id', orgId)
      .eq('status', 'converted')
      .gte('converted_at', since);

    // Compare converted vs non-converted lead profiles
    const { data: nonConvertedLeads } = await supabase
      .from('mkt_leads')
      .select('industry, company_size, job_title, source, total_score')
      .eq('org_id', orgId)
      .neq('status', 'converted')
      .gte('created_at', since);

    if ((!convertedLeads || convertedLeads.length === 0) && (!nonConvertedLeads || nonConvertedLeads.length === 0)) {
      return [];
    }

    // Build profile distributions
    const buildDistribution = (leads: Array<Record<string, unknown>> | null, field: string): Record<string, number> => {
      const dist: Record<string, number> = {};
      for (const lead of (leads || [])) {
        const val = (lead[field] as string) || 'unknown';
        dist[val] = (dist[val] || 0) + 1;
      }
      return dist;
    };

    const converted = {
      count: (convertedLeads || []).length,
      industries: buildDistribution(convertedLeads, 'industry'),
      company_sizes: buildDistribution(convertedLeads, 'company_size'),
      designations: buildDistribution(convertedLeads, 'job_title'),
      sources: buildDistribution(convertedLeads, 'source'),
      avg_score: (convertedLeads || []).length > 0
        ? Math.round((convertedLeads || []).reduce((s, l) => s + ((l.total_score as number) || 0), 0) / (convertedLeads || []).length)
        : 0,
    };

    const nonConverted = {
      count: (nonConvertedLeads || []).length,
      industries: buildDistribution(nonConvertedLeads, 'industry'),
      company_sizes: buildDistribution(nonConvertedLeads, 'company_size'),
      designations: buildDistribution(nonConvertedLeads, 'job_title'),
      sources: buildDistribution(nonConvertedLeads, 'source'),
      avg_score: (nonConvertedLeads || []).length > 0
        ? Math.round((nonConvertedLeads || []).reduce((s, l) => s + ((l.total_score as number) || 0), 0) / (nonConvertedLeads || []).length)
        : 0,
    };

    // Update campaign ICP criteria recommendations
    const prompt = `You are an ICP (Ideal Customer Profile) analyst. Compare converted vs non-converted lead profiles to identify the best-fit customer characteristics.

CONVERTED LEADS (${converted.count}):
  Industries: ${JSON.stringify(converted.industries)}
  Company sizes: ${JSON.stringify(converted.company_sizes)}
  Designations: ${JSON.stringify(converted.designations)}
  Sources: ${JSON.stringify(converted.sources)}
  Avg lead score: ${converted.avg_score}

NON-CONVERTED LEADS (${nonConverted.count}):
  Industries: ${JSON.stringify(nonConverted.industries)}
  Company sizes: ${JSON.stringify(nonConverted.company_sizes)}
  Designations: ${JSON.stringify(nonConverted.designations)}
  Sources: ${JSON.stringify(nonConverted.sources)}
  Avg lead score: ${nonConverted.avg_score}

Return a JSON array of ICP recommendations:
[{
  "campaign_id": "icp-refinement",
  "campaign_name": "ICP Analysis",
  "type": "icp",
  "priority": "high|medium|low",
  "recommendation": "Specific targeting change",
  "reasoning": "Data-backed reasoning comparing converted vs non-converted profiles"
}]

Rules:
- Max 3 recommendations
- Identify which industries, company sizes, designations, and sources have the highest conversion rates
- Suggest dropping or deprioritizing segments with low conversion
- Suggest doubling down on high-conversion segments
- If sample size is too small (< 5 conversions), note that confidence is low`;

    const { data } = await callLLMJson<OptimizationRecommendation[]>(prompt, {
      model: 'sonnet',
      max_tokens: 768,
      temperature: 0.3,
    });

    const recs = (Array.isArray(data) ? data : []).map((r) => ({
      ...r,
      type: 'icp' as const,
      auto_applied: false,
    }));

    await logger.info('icp-refinement-complete', {
      org_id: orgId,
      converted_leads: converted.count,
      non_converted_leads: nonConverted.count,
      recommendations: recs.length,
    });

    // Trigger ICP evolution for this org.
    // mkt-evolve-icp enforces its own guard conditions (7-day cadence, min 5 conversions),
    // so calling it daily from the optimizer is safe — it skips when conditions aren't met.
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceKey) {
        const res = await fetch(`${supabaseUrl}/functions/v1/mkt-evolve-icp`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mode: 'evolve', org_id: orgId }),
        });
        // Consume body to release the TCP connection
        await res.body?.cancel();
      }
    } catch (evolveError) {
      await logger.warn('icp-evolution-trigger-failed', {
        org_id: orgId,
        error: evolveError instanceof Error ? evolveError.message : String(evolveError),
      });
    }

    return recs;
  } catch (error) {
    console.error('[mkt-campaign-optimizer] ICP refinement failed:', error);
    return [];
  }
}
