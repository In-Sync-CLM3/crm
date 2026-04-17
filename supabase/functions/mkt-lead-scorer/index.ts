import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger, logEngine, withTiming } from '../_shared/engineLogger.ts';
import { callLLMJson } from '../_shared/llmClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50; // Leads per run
const PARALLEL_SIZE = 10; // Concurrent Haiku calls
const STALE_HOURS = 24; // Re-score if older than this

interface ScoreResult {
  fit_score: number; // 0-40
  intent_score: number; // 0-30
  engagement_score: number; // 0-30
  total_score: number; // 0-100
  fit_reasons: string[];
  intent_signals: string[];
  engagement_events: string[];
  recommendation: string; // "enroll" | "nurture" | "disqualify" | "monitor"
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-lead-scorer');

  try {
    const supabase = getSupabaseClient();

    // Allow targeting a specific org or lead
    let targetOrgId: string | null = null;
    let targetLeadId: string | null = null;
    try {
      const body = await req.json();
      targetOrgId = body?.org_id || null;
      targetLeadId = body?.lead_id || null;
    } catch {
      // Scheduled invocation — score all pending
    }

    // Fetch leads needing scoring
    const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('mkt_leads')
      .select('*')
      .in('status', ['new', 'enriched', 'scored'])
      .or(`scored_at.is.null,scored_at.lt.${staleThreshold}`)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (targetOrgId) {
      query = query.eq('org_id', targetOrgId);
    }
    if (targetLeadId) {
      query = query.eq('id', targetLeadId);
    }

    const { data: leads, error: leadsError } = await query;

    if (leadsError) throw leadsError;

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No leads to score', scored: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Read score thresholds — single source of truth in mkt_engine_config
    const configOrgId = targetOrgId || leads[0].org_id as string;
    const { data: thresholdsRow } = await supabase
      .from('mkt_engine_config')
      .select('config_value')
      .eq('org_id', configOrgId)
      .eq('config_key', 'score_thresholds')
      .maybeSingle();
    const thresholds = (thresholdsRow?.config_value as Record<string, number> | null) ?? {};
    const enrollmentMin: number = thresholds.enrollment_min ?? 40;

    await logger.info('scoring-start', { lead_count: leads.length, enrollment_min: enrollmentMin });

    // Fetch campaign metadata (batch to avoid N+1)
    const campaignIds = [...new Set(leads.map((l) => l.campaign_id).filter(Boolean))];
    const { data: campaigns } = await supabase
      .from('mkt_campaigns')
      .select('id, name, product_key')
      .in('id', campaignIds.length > 0 ? campaignIds : ['__none__']);

    // Fetch ICP from mkt_product_icp — single source of truth
    const productKeys = [...new Set((campaigns || []).map((c) => c.product_key).filter(Boolean))];
    const { data: icpRows } = await supabase
      .from('mkt_product_icp')
      .select('product_key, industries, designations, company_sizes, geographies, languages, pain_points')
      .in('product_key', productKeys.length > 0 ? productKeys : ['__none__'])
      .order('version', { ascending: false });

    // Keep latest version per product_key
    const icpByProductKey = new Map<string, Record<string, unknown>>();
    for (const row of icpRows || []) {
      if (!icpByProductKey.has(row.product_key)) icpByProductKey.set(row.product_key, row);
    }

    const campaignMap = new Map((campaigns || []).map((c) => [c.id, c]));

    // Fetch recent sequence actions for engagement scoring
    const leadIds = leads.map((l) => l.id);
    const { data: recentActions } = await supabase
      .from('mkt_sequence_actions')
      .select('enrollment_id, channel, status, opened_at, clicked_at, replied_at')
      .in('enrollment_id',
        (await supabase
          .from('mkt_sequence_enrollments')
          .select('id')
          .in('lead_id', leadIds)
        ).data?.map((e) => e.id) || ['__none__']
      );

    // Group actions by enrollment for quick lookup
    const actionsByEnrollment = new Map<string, typeof recentActions>();
    for (const action of recentActions || []) {
      const existing = actionsByEnrollment.get(action.enrollment_id) || [];
      existing.push(action);
      actionsByEnrollment.set(action.enrollment_id, existing);
    }

    // Fetch enrollments to map lead_id → actions
    const { data: enrollments } = await supabase
      .from('mkt_sequence_enrollments')
      .select('id, lead_id')
      .in('lead_id', leadIds);

    const actionsForLead = new Map<string, typeof recentActions>();
    for (const enrollment of enrollments || []) {
      const actions = actionsByEnrollment.get(enrollment.id) || [];
      const existing = actionsForLead.get(enrollment.lead_id) || [];
      actionsForLead.set(enrollment.lead_id, [...existing, ...actions]);
    }

    let scored = 0;
    let failed = 0;
    let totalTokens = 0;

    // Process in parallel batches
    for (let i = 0; i < leads.length; i += PARALLEL_SIZE) {
      const batch = leads.slice(i, i + PARALLEL_SIZE);

      const results = await Promise.allSettled(
        batch.map((lead) =>
          scoreLead(supabase, lead, campaignMap, actionsForLead.get(lead.id) || [], enrollmentMin, icpByProductKey)
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          scored++;
          totalTokens += result.value.tokens;
        } else {
          failed++;
          console.error('[mkt-lead-scorer] Score failed:', result.reason);
        }
      }
    }

    await logger.info('scoring-complete', {
      scored,
      failed,
      total_tokens: totalTokens,
    }, { tokens_used: totalTokens });

    return new Response(
      JSON.stringify({ message: 'Lead scoring complete', scored, failed, total_tokens: totalTokens }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('scorer-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Score a single lead using Claude Haiku, with heuristic fallback if LLM is unavailable.
 */
async function scoreLead(
  supabase: ReturnType<typeof getSupabaseClient>,
  lead: Record<string, unknown>,
  campaignMap: Map<string, { id: string; name: string; product_key?: string }>,
  actions: Array<Record<string, unknown>>,
  enrollmentMin: number,
  icpByProductKey: Map<string, Record<string, unknown>>,
): Promise<{ tokens: number }> {
  const campaign = lead.campaign_id ? campaignMap.get(lead.campaign_id as string) : null;
  const icp = (campaign?.product_key && icpByProductKey.get(campaign.product_key as string)) || {};
  const engagementSummary = buildEngagementSummary(actions);

  let scoreData: ScoreResult;
  let tokensUsed = 0;
  let scoringModel = 'v1-haiku';

  // --- Attempt LLM scoring, fall back to heuristic on failure ---
  try {
    const prompt = `You are a B2B lead scoring engine. Score this lead against the ICP criteria.

LEAD PROFILE:
- Name: ${lead.first_name || ''} ${lead.last_name || ''}
- Email: ${lead.email || 'N/A'}
- Job Title: ${lead.job_title || 'N/A'}
- Company: ${lead.company || 'N/A'}
- Industry: ${lead.industry || 'N/A'}
- Company Size: ${lead.company_size || 'N/A'}
- Location: ${[lead.city, lead.state, lead.country].filter(Boolean).join(', ') || 'N/A'}
- Source: ${lead.source || 'N/A'}
- LinkedIn: ${lead.linkedin_url ? 'Yes' : 'No'}

ICP CRITERIA:
${JSON.stringify(icp, null, 2)}

ENGAGEMENT HISTORY:
${engagementSummary || 'No engagement yet (new lead)'}

SCORING RULES:
1. fit_score (0-40): How well does this lead match the ICP? Consider: role/title match, company size match, industry match, geography match.
2. intent_score (0-30): How likely is this lead to be in-market? Consider: job title suggesting decision-maker, company growth signals, technology stack alignment.
3. engagement_score (0-30): How engaged has this lead been? Consider: email opens/clicks, replies, call outcomes. New leads with no engagement get 5-10 points baseline.
4. total_score = fit_score + intent_score + engagement_score (0-100)

You MUST return ONLY a JSON object with this exact structure, no other text:
{"fit_score": <number>, "intent_score": <number>, "engagement_score": <number>, "total_score": <number>, "fit_reasons": ["reason1"], "intent_signals": ["signal1"], "engagement_events": ["event1"], "recommendation": "enroll|nurture|disqualify|monitor"}

recommendation guide:
- "enroll": total >= ${enrollmentMin}, ready for outreach sequence
- "nurture": total 20-${enrollmentMin - 1}, needs warming up
- "monitor": total 20-39, not ready yet
- "disqualify": total < 20 or clear ICP mismatch`;

    const result = await callLLMJson<ScoreResult>(prompt, {
      model: 'haiku',
      max_tokens: 512,
      temperature: 0.1,
    });

    // Validate the parsed response has actual score fields
    const parsed = result.data;
    if (
      typeof parsed !== 'object' || parsed === null ||
      (typeof parsed.fit_score !== 'number' && typeof parsed.intent_score !== 'number')
    ) {
      throw new Error(`LLM returned unexpected shape: ${JSON.stringify(parsed).substring(0, 200)}`);
    }

    scoreData = parsed;
    tokensUsed = result.tokens.input + result.tokens.output;
  } catch (llmError) {
    // Log the LLM failure with full details
    console.error('[mkt-lead-scorer] LLM call failed, using heuristic fallback:', llmError);
    await logEngine({
      function_name: 'mkt-lead-scorer',
      action: 'llm-fallback-triggered',
      level: 'warn',
      details: {
        lead_id: lead.id,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      },
    });

    // Heuristic fallback scoring
    scoreData = heuristicScore(lead, icp, actions, enrollmentMin);
    scoringModel = 'v1-heuristic';
  }

  // Clamp scores to valid ranges
  const fit = Math.min(40, Math.max(0, Number(scoreData.fit_score) || 0));
  const intent = Math.min(30, Math.max(0, Number(scoreData.intent_score) || 0));
  const engagement = Math.min(30, Math.max(0, Number(scoreData.engagement_score) || 0));
  const total = fit + intent + engagement;

  // Determine recommendation from total if missing
  const recommendation = scoreData.recommendation ||
    (total >= enrollmentMin ? 'enroll' : total >= 20 ? 'nurture' : total >= 10 ? 'monitor' : 'disqualify');

  // Get previous scores for delta tracking
  const { data: previousScore } = await supabase
    .from('mkt_lead_scores')
    .select('fit_score, intent_score, engagement_score, total_score')
    .eq('lead_id', lead.id as string)
    .single();

  // Upsert to mkt_lead_scores
  await supabase.from('mkt_lead_scores').upsert(
    {
      org_id: lead.org_id as string,
      lead_id: lead.id as string,
      fit_score: fit,
      intent_score: intent,
      engagement_score: engagement,
      total_score: total,
      scoring_model: scoringModel,
      scoring_details: {
        fit_reasons: scoreData.fit_reasons || [],
        intent_signals: scoreData.intent_signals || [],
        engagement_events: scoreData.engagement_events || [],
        recommendation,
      },
      scored_at: new Date().toISOString(),
    },
    { onConflict: 'lead_id' }
  );

  // Log score history if there was a previous score
  if (previousScore) {
    await supabase.from('mkt_lead_score_history').insert({
      org_id: lead.org_id as string,
      lead_id: lead.id as string,
      previous_total: previousScore.total_score,
      new_total: total,
      fit_delta: fit - (previousScore.fit_score || 0),
      intent_delta: intent - (previousScore.intent_score || 0),
      engagement_delta: engagement - (previousScore.engagement_score || 0),
      reason: `Rescored (${scoringModel}): ${recommendation}`,
      triggered_by: 'scorer',
    });
  }

  // Update the lead record
  const newStatus = lead.status === 'new' || lead.status === 'enriched' ? 'scored' : (lead.status as string);
  await supabase
    .from('mkt_leads')
    .update({
      fit_score: fit,
      intent_score: intent,
      engagement_score: engagement,
      total_score: total,
      scored_at: new Date().toISOString(),
      status: newStatus,
    })
    .eq('id', lead.id as string);

  // Auto-enroll if score meets threshold (from mkt_engine_config.score_thresholds.enrollment_min)
  if (total >= enrollmentMin && lead.status !== 'enrolled' && lead.status !== 'converted') {
    const leadCampaign = lead.campaign_id ? campaignMap.get(lead.campaign_id as string) : null;
    const productKey = leadCampaign?.product_key;

    let campaignQuery = supabase
      .from('mkt_campaigns')
      .select('id')
      .eq('org_id', lead.org_id as string)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (productKey) {
      campaignQuery = campaignQuery.eq('product_key', productKey);
    }

    const { data: activeCampaigns } = await campaignQuery;

    if (activeCampaigns && activeCampaigns.length > 0) {
      const { data: existingEnrollment } = await supabase
        .from('mkt_sequence_enrollments')
        .select('id')
        .eq('lead_id', lead.id as string)
        .eq('campaign_id', activeCampaigns[0].id)
        .limit(1);

      if (!existingEnrollment || existingEnrollment.length === 0) {
        await supabase.from('mkt_sequence_enrollments').insert({
          org_id: lead.org_id as string,
          campaign_id: activeCampaigns[0].id,
          lead_id: lead.id as string,
          status: 'active',
          current_step: 1,
          next_action_at: new Date().toISOString(),
        });

        await supabase.from('mkt_leads').update({ status: 'enrolled' }).eq('id', lead.id as string);
      }
    }
  }

  return { tokens: tokensUsed };
}

/**
 * Rule-based heuristic scorer — used when LLM is unavailable.
 * Produces non-zero scores based on available lead data fields.
 */
function heuristicScore(
  lead: Record<string, unknown>,
  icp: Record<string, unknown>,
  actions: Array<Record<string, unknown>>,
  enrollmentMin: number,
): ScoreResult {
  let fit = 10; // Base fit score for any lead in the system
  const fitReasons: string[] = [];

  // Job title scoring
  const title = String(lead.job_title || '').toLowerCase();
  const seniorTitles = ['ceo', 'cto', 'cfo', 'coo', 'vp', 'director', 'head', 'founder', 'owner', 'managing', 'president', 'partner'];
  const midTitles = ['manager', 'lead', 'senior', 'principal', 'chief'];
  if (seniorTitles.some(t => title.includes(t))) {
    fit += 15;
    fitReasons.push('Senior decision-maker title');
  } else if (midTitles.some(t => title.includes(t))) {
    fit += 8;
    fitReasons.push('Mid-level title with potential influence');
  }

  // Company present
  if (lead.company) {
    fit += 5;
    fitReasons.push('Company identified');
  }

  // Email domain (non-free)
  const email = String(lead.email || '');
  const freeDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
  if (email && !freeDomains.some(d => email.endsWith(d))) {
    fit += 5;
    fitReasons.push('Business email domain');
  }

  // LinkedIn present
  if (lead.linkedin_url) {
    fit += 3;
    fitReasons.push('LinkedIn profile available');
  }

  // ICP match bonus (if ICP has industry/geography and lead matches)
  if (icp && Object.keys(icp).length > 0) {
    fit += 2;
    fitReasons.push('ICP criteria defined for campaign');
  }

  fit = Math.min(40, fit);

  // Intent scoring
  let intent = 8; // Base intent for any sourced lead
  const intentSignals: string[] = [];

  if (lead.company_size) {
    intent += 5;
    intentSignals.push('Company size known');
  }
  if (lead.industry) {
    intent += 5;
    intentSignals.push('Industry identified');
  }
  if (seniorTitles.some(t => title.includes(t))) {
    intent += 7;
    intentSignals.push('Decision-maker role suggests buying authority');
  }
  if (lead.source === 'inbound' || lead.source === 'referral' || lead.source === 'website') {
    intent += 5;
    intentSignals.push(`High-intent source: ${lead.source}`);
  }
  intent = Math.min(30, intent);

  // Engagement scoring
  let engagement = 5; // Base for new leads
  const engagementEvents: string[] = ['New lead baseline'];

  for (const action of actions || []) {
    if (action.replied_at) {
      engagement += 10;
      engagementEvents.push('Reply received');
    } else if (action.clicked_at) {
      engagement += 5;
      engagementEvents.push('Link clicked');
    } else if (action.opened_at) {
      engagement += 2;
      engagementEvents.push('Email opened');
    }
  }
  engagement = Math.min(30, engagement);

  const total = fit + intent + engagement;
  const recommendation = total >= enrollmentMin ? 'enroll' : total >= 20 ? 'nurture' : total >= 10 ? 'monitor' : 'disqualify';

  return {
    fit_score: fit,
    intent_score: intent,
    engagement_score: engagement,
    total_score: total,
    fit_reasons: fitReasons,
    intent_signals: intentSignals,
    engagement_events: engagementEvents,
    recommendation,
  };
}

/**
 * Build a human-readable engagement summary from sequence actions.
 */
function buildEngagementSummary(actions: Array<Record<string, unknown>>): string {
  if (!actions || actions.length === 0) return '';

  const stats = {
    emails_sent: 0,
    emails_opened: 0,
    emails_clicked: 0,
    whatsapp_sent: 0,
    calls_made: 0,
    replies_received: 0,
  };

  for (const action of actions) {
    if (action.channel === 'email') {
      stats.emails_sent++;
      if (action.opened_at) stats.emails_opened++;
      if (action.clicked_at) stats.emails_clicked++;
    } else if (action.channel === 'whatsapp') {
      stats.whatsapp_sent++;
    } else if (action.channel === 'call') {
      stats.calls_made++;
    }
    if (action.replied_at) stats.replies_received++;
  }

  const parts: string[] = [];
  if (stats.emails_sent > 0) {
    parts.push(`${stats.emails_sent} emails sent (${stats.emails_opened} opened, ${stats.emails_clicked} clicked)`);
  }
  if (stats.whatsapp_sent > 0) parts.push(`${stats.whatsapp_sent} WhatsApp messages sent`);
  if (stats.calls_made > 0) parts.push(`${stats.calls_made} calls made`);
  if (stats.replies_received > 0) parts.push(`${stats.replies_received} replies received`);

  return parts.join('; ');
}
