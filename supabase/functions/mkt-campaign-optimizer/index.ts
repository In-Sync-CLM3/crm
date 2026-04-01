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
  type: 'timing' | 'messaging' | 'channel_mix' | 'budget' | 'audience' | 'pause';
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

      // Store recommendations in daily digest
      await supabase.from('mkt_daily_digests').upsert(
        {
          org_id: orgId,
          digest_date: new Date().toISOString().split('T')[0],
          recommendations: allRecommendations.filter((r) => orgCampaigns.some((c) => c.id === r.campaign_id)),
        },
        { onConflict: 'org_id,digest_date' }
      );
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
