import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLMJson } from '../_shared/llmClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DecisionRequest {
  org_id: string;
  response_text: string;
  report_date?: string;
  // OR individual decision
  decision_id?: string;
  decision_type?: string;
  your_response?: string;
}

interface ParsedDecision {
  question_number: number;
  decision_type: string;
  response: string;
  product_key?: string;
}

/**
 * Receives founder's reply to the Wednesday Report.
 * Can be triggered via:
 * 1. Email webhook (reply to report email)
 * 2. Manual API call from CRM UI
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-product-decision-logger');

  try {
    const supabase = getSupabaseClient();
    const body: DecisionRequest = await req.json();

    // Mode 1: Individual decision update (from UI)
    if (body.decision_id) {
      await supabase
        .from('mkt_product_decisions')
        .update({
          your_response: body.your_response || body.response_text,
          decision_type: body.decision_type,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.decision_id);

      await logger.info('decision-logged', { decision_id: body.decision_id, type: body.decision_type });

      return new Response(
        JSON.stringify({ success: true, updated: 1 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode 2: Parse full email reply with multiple decisions
    if (!body.response_text || !body.org_id) {
      return new Response(
        JSON.stringify({ error: 'response_text and org_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the most recent report for this org
    const reportDate = body.report_date || new Date().toISOString().split('T')[0];

    const { data: pendingDecisions } = await supabase
      .from('mkt_product_decisions')
      .select('*')
      .eq('org_id', body.org_id)
      .is('your_response', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!pendingDecisions || pendingDecisions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending decisions to update' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Sonnet to parse the founder's reply and match to questions
    const parsedDecisions = await parseFounderReply(
      body.response_text,
      pendingDecisions
    );

    let updated = 0;

    for (const parsed of parsedDecisions) {
      // Find matching decision record
      const matchingDecision = pendingDecisions.find((d, i) => {
        // Match by question number (order) or product_key
        if (parsed.product_key && d.product_key === parsed.product_key) return true;
        if (parsed.question_number > 0 && i === parsed.question_number - 1) return true;
        return false;
      });

      if (matchingDecision) {
        await supabase
          .from('mkt_product_decisions')
          .update({
            your_response: parsed.response,
            decision_type: parsed.decision_type,
            updated_at: new Date().toISOString(),
          })
          .eq('id', matchingDecision.id);

        // If decision is "build", update the feature signal with the decision
        if (parsed.decision_type === 'build' && matchingDecision.feature_signal_ids) {
          const signalIds = matchingDecision.feature_signal_ids as string[];
          if (signalIds.length > 0) {
            await supabase
              .from('mkt_feature_signals')
              .update({
                your_decision: 'build',
                decision_at: new Date().toISOString(),
              })
              .in('id', signalIds);
          }
        }

        updated++;
      }
    }

    await logger.info('decisions-parsed', {
      org_id: body.org_id,
      total_parsed: parsedDecisions.length,
      updated,
      pending_remaining: pendingDecisions.length - updated,
    });

    return new Response(
      JSON.stringify({
        success: true,
        parsed: parsedDecisions.length,
        updated,
        decisions: parsedDecisions.map((d) => ({
          question: d.question_number,
          product_key: d.product_key,
          decision: d.decision_type,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('decision-logger-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Parse the founder's reply using Sonnet to extract decisions.
 */
async function parseFounderReply(
  replyText: string,
  pendingDecisions: Array<Record<string, unknown>>
): Promise<ParsedDecision[]> {
  const questionsContext = pendingDecisions
    .map((d, i) => `Q${i + 1}: ${d.product_key} — ${(d.engine_question as string).substring(0, 100)}`)
    .join('\n');

  const prompt = `Parse this founder's reply to a product intelligence report. Extract each decision.

PENDING QUESTIONS:
${questionsContext}

FOUNDER'S REPLY:
${replyText.substring(0, 3000)}

For each decision found, return JSON array:
[
  {
    "question_number": 1,
    "decision_type": "investigate|build|wont-build|defer|needs-more-data|acknowledged",
    "response": "The founder's exact words for this decision",
    "product_key": "matching product_key from questions"
  }
]

CLASSIFICATION RULES:
- "build" = founder says yes, add it, let's do it, approve, green light
- "investigate" = founder wants more data, research, prototype, POC
- "wont-build" = founder says no, not now, doesn't align, reject
- "defer" = maybe later, not this quarter, backlog it, park it
- "needs-more-data" = can't decide, need numbers, need user interviews
- "acknowledged" = founder acknowledges but gives no clear decision

If the reply doesn't clearly map to a question, try to match by topic/product_key.
Return empty array if no decisions can be extracted.`;

  const { data } = await callLLMJson<ParsedDecision[]>(prompt, {
    model: 'sonnet',
    max_tokens: 1024,
    temperature: 0.1,
  });

  return Array.isArray(data) ? data : [];
}
