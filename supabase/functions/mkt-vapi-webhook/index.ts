import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { updateMemory } from '../_shared/conversationMemory.ts';
import { callGroqJson } from '../_shared/groqClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Receives Vapi call completion webhooks.
 * Processes transcript, updates action status, extracts conversation insights,
 * triggers feature-signal-extractor.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-vapi-webhook');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const payload = await req.json();
    const messageType = payload.message?.type || payload.type;

    // Vapi sends several event types
    switch (messageType) {
      case 'end-of-call-report':
        await handleEndOfCall(supabase, supabaseUrl, serviceRoleKey, payload.message || payload, logger);
        break;

      case 'status-update':
        await handleStatusUpdate(supabase, payload.message || payload, logger);
        break;

      case 'function-call':
        // Handle tool/function calls from the AI agent during the call
        return handleFunctionCall(payload.message || payload);

      case 'hang':
      case 'speech-update':
      case 'transcript':
        // Real-time events — acknowledge but don't process
        break;

      default:
        await logger.info('unknown-event', { type: messageType });
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('vapi-webhook-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Handle end-of-call report — the main event with full transcript.
 */
async function handleEndOfCall(
  supabase: ReturnType<typeof getSupabaseClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  report: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  const metadata = (report.metadata || {}) as Record<string, string>;
  const actionId = metadata.action_id;
  const leadId = metadata.lead_id;
  const orgId = metadata.org_id;
  const enrollmentId = metadata.enrollment_id;

  if (!actionId || !leadId) {
    await logger.warn('missing-metadata', { metadata });
    return;
  }

  const transcript = report.transcript as string || '';
  const summary = report.summary as string || '';
  const durationSeconds = report.endedReason === 'customer-ended' || report.endedReason === 'assistant-ended'
    ? Math.round(((report.endedAt as number) - (report.startedAt as number)) / 1000)
    : 0;
  const endedReason = report.endedReason as string || 'unknown';
  const cost = report.cost as number || 0;

  // Determine call outcome
  const outcome = categorizeCallOutcome(endedReason, transcript, summary);

  // Update the action record
  await supabase
    .from('mkt_sequence_actions')
    .update({
      status: outcome === 'answered' ? 'delivered' : 'sent',
      delivered_at: outcome === 'answered' ? new Date().toISOString() : undefined,
      replied_at: outcome === 'engaged' ? new Date().toISOString() : undefined,
      metadata: {
        transcript,
        summary,
        duration_seconds: durationSeconds,
        ended_reason: endedReason,
        outcome,
        cost,
      },
    })
    .eq('id', actionId);

  // Extract conversation insights using Groq (fast)
  let insights: CallInsights | null = null;
  if (transcript && transcript.length > 50) {
    try {
      insights = await extractCallInsights(transcript, summary);
    } catch (err) {
      console.error('[mkt-vapi-webhook] Insight extraction failed:', err);
    }
  }

  // Update conversation memory
  const memorySummary = insights
    ? `AI call (${durationSeconds}s): ${insights.one_line_summary}`
    : `AI call (${durationSeconds}s): ${outcome}. ${summary?.substring(0, 100) || 'No summary'}`;

  await updateMemory(leadId, orgId, 'call', {
    direction: 'outbound',
    summary: memorySummary,
    details: { outcome, duration_seconds: durationSeconds, ended_reason: endedReason },
    key_facts: insights?.key_facts || [],
    objections: insights?.objections || [],
    interests: insights?.interests || [],
    next_steps: insights?.next_steps || [],
  });

  // Update engagement score
  const scoreDelta = outcome === 'engaged' ? 8 : outcome === 'answered' ? 4 : 1;
  await updateCallEngagementScore(supabase, leadId, orgId, scoreDelta);

  // Trigger feature-signal-extractor for product signals in the transcript
  if (transcript && transcript.length > 100) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/mkt-feature-signal-extractor`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lead_id: leadId,
          org_id: orgId,
          source_channel: 'vapi-transcript',
          text: transcript,
        }),
      });
    } catch (err) {
      console.error('[mkt-vapi-webhook] Feature signal extraction dispatch failed:', err);
    }
  }

  await logger.info('call-completed', {
    action_id: actionId,
    lead_id: leadId,
    outcome,
    duration_seconds: durationSeconds,
    has_insights: !!insights,
  });
}

/**
 * Handle Vapi status update events during call.
 */
async function handleStatusUpdate(
  supabase: ReturnType<typeof getSupabaseClient>,
  event: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  const metadata = (event.metadata || {}) as Record<string, string>;
  const actionId = metadata.action_id;
  const status = event.status as string;

  if (!actionId) return;

  // Map Vapi statuses
  if (status === 'in-progress') {
    await supabase
      .from('mkt_sequence_actions')
      .update({ delivered_at: new Date().toISOString() })
      .eq('id', actionId);
  }
}

/**
 * Handle function calls from Vapi AI during the call.
 * These can be used for real-time actions like booking meetings.
 */
function handleFunctionCall(event: Record<string, unknown>): Response {
  const functionCall = event.functionCall as Record<string, unknown> | undefined;
  if (!functionCall) {
    return new Response(JSON.stringify({ result: 'No function call' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const name = functionCall.name as string;

  // Handle known function calls
  switch (name) {
    case 'book_meeting':
      return new Response(
        JSON.stringify({
          result: 'Meeting booking noted. I will send you a calendar invite after this call.',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );

    case 'end_call':
      return new Response(
        JSON.stringify({ result: 'Call ended.' }),
        { headers: { 'Content-Type': 'application/json' } }
      );

    default:
      return new Response(
        JSON.stringify({ result: `Function ${name} not implemented` }),
        { headers: { 'Content-Type': 'application/json' } }
      );
  }
}

interface CallInsights {
  one_line_summary: string;
  key_facts: string[];
  objections: string[];
  interests: string[];
  next_steps: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
}

/**
 * Extract structured insights from call transcript using Groq (fast).
 */
async function extractCallInsights(
  transcript: string,
  summary: string
): Promise<CallInsights> {
  const prompt = `Analyze this sales call transcript and extract structured insights.

TRANSCRIPT:
${transcript.substring(0, 3000)}

${summary ? `SUMMARY: ${summary}` : ''}

Return JSON:
{
  "one_line_summary": "Brief summary of the call outcome",
  "key_facts": ["Important facts learned about the prospect"],
  "objections": ["Any objections or concerns raised"],
  "interests": ["Products/features they showed interest in"],
  "next_steps": ["Agreed next steps, if any"],
  "sentiment": "positive|neutral|negative"
}`;

  const { data } = await callGroqJson<CallInsights>(prompt, {
    max_tokens: 512,
    temperature: 0.2,
  });

  return data;
}

/**
 * Categorize the call outcome based on ended reason and transcript.
 */
function categorizeCallOutcome(
  endedReason: string,
  transcript: string,
  summary: string
): 'engaged' | 'answered' | 'voicemail' | 'no_answer' | 'failed' {
  if (endedReason === 'voicemail') return 'voicemail';
  if (endedReason === 'no-answer' || endedReason === 'busy') return 'no_answer';
  if (endedReason === 'error' || endedReason === 'phone-call-provider-error') return 'failed';

  // If there's substantial transcript, the call was engaged
  if (transcript && transcript.length > 200) return 'engaged';
  if (transcript && transcript.length > 0) return 'answered';

  return 'answered';
}

/**
 * Update engagement score after a call.
 */
async function updateCallEngagementScore(
  supabase: ReturnType<typeof getSupabaseClient>,
  leadId: string,
  orgId: string,
  delta: number
): Promise<void> {
  try {
    const { data: scores } = await supabase
      .from('mkt_lead_scores')
      .select('engagement_score, total_score')
      .eq('lead_id', leadId)
      .single();

    if (!scores) return;

    const newEngagement = Math.min(30, (scores.engagement_score || 0) + delta);
    const newTotal = (scores.total_score || 0) - (scores.engagement_score || 0) + newEngagement;

    await supabase
      .from('mkt_lead_scores')
      .update({ engagement_score: newEngagement, total_score: newTotal, scored_at: new Date().toISOString() })
      .eq('lead_id', leadId);

    await supabase
      .from('mkt_leads')
      .update({ engagement_score: newEngagement, total_score: newTotal })
      .eq('id', leadId);

    await supabase.from('mkt_lead_score_history').insert({
      org_id: orgId,
      lead_id: leadId,
      previous_total: scores.total_score,
      new_total: newTotal,
      engagement_delta: delta,
      reason: 'AI call outcome',
      triggered_by: 'call_outcome',
    });
  } catch (err) {
    console.error('[mkt-vapi-webhook] Score update failed:', err);
  }
}
