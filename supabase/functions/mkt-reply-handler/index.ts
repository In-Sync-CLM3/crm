import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLMJson } from '../_shared/llmClient.ts';
import { updateMemory } from '../_shared/conversationMemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReplyRequest {
  lead_id: string;
  org_id: string;
  channel: string; // email | whatsapp
  message_text: string;
  from?: string;
  subject?: string; // For email replies
  in_reply_to?: string; // Email message ID being replied to
}

interface ReplyAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  intent: 'interested' | 'not_interested' | 'question' | 'objection' | 'unsubscribe' | 'meeting_request' | 'other';
  key_facts: string[];
  objections: string[];
  interests: string[];
  next_steps: string[];
  requires_human_handoff: boolean;
  handoff_reason?: string;
  product_signals: string[];
  summary: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-reply-handler');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body: ReplyRequest = await req.json();
    const { lead_id, org_id, channel, message_text, subject } = body;

    if (!lead_id || !message_text) {
      return new Response(
        JSON.stringify({ error: 'lead_id and message_text required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logger.info('reply-received', {
      lead_id,
      channel,
      text_length: message_text.length,
    });

    // Analyze the reply using Haiku
    const analysis = await analyzeReply(message_text, channel, subject);

    // Update conversation memory with extracted insights
    await updateMemory(lead_id, org_id, channel, {
      direction: 'inbound',
      summary: `${channel} reply: ${analysis.summary}`,
      details: {
        sentiment: analysis.sentiment,
        intent: analysis.intent,
        full_text: message_text.substring(0, 500),
      },
      key_facts: analysis.key_facts,
      objections: analysis.objections,
      interests: analysis.interests,
      next_steps: analysis.next_steps,
    });

    // Find and update the most recent outbound action on this channel
    const { data: enrollment } = await supabase
      .from('mkt_sequence_enrollments')
      .select('id')
      .eq('lead_id', lead_id)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (enrollment) {
      const { data: latestAction } = await supabase
        .from('mkt_sequence_actions')
        .select('id')
        .eq('enrollment_id', enrollment.id)
        .eq('channel', channel)
        .is('replied_at', null)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestAction) {
        await supabase
          .from('mkt_sequence_actions')
          .update({ replied_at: new Date().toISOString() })
          .eq('id', latestAction.id);
      }
    }

    // Update engagement score (reply = high engagement)
    await updateReplyEngagementScore(supabase, lead_id, org_id, analysis.sentiment);

    // Handle special intents
    if (analysis.intent === 'unsubscribe') {
      await handleUnsubscribe(supabase, lead_id, org_id, channel);
    }

    if (analysis.requires_human_handoff) {
      await handleHumanHandoff(supabase, lead_id, org_id, channel, analysis, message_text);
    }

    // Trigger feature-signal-extractor if product signals detected
    if (analysis.product_signals.length > 0) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/mkt-feature-signal-extractor`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lead_id,
            org_id,
            source_channel: `${channel}-reply`,
            text: message_text,
          }),
        });
      } catch (err) {
        console.error('[mkt-reply-handler] Feature signal dispatch failed:', err);
      }
    }

    await logger.info('reply-processed', {
      lead_id,
      sentiment: analysis.sentiment,
      intent: analysis.intent,
      requires_handoff: analysis.requires_human_handoff,
      product_signals: analysis.product_signals.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        analysis: {
          sentiment: analysis.sentiment,
          intent: analysis.intent,
          requires_handoff: analysis.requires_human_handoff,
          summary: analysis.summary,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('reply-handler-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Analyze a reply using Claude Haiku.
 */
async function analyzeReply(
  text: string,
  channel: string,
  subject?: string
): Promise<ReplyAnalysis> {
  const prompt = `Analyze this ${channel} reply from a sales/marketing lead. Extract structured insights.

${subject ? `SUBJECT: ${subject}` : ''}
MESSAGE:
${text.substring(0, 2000)}

Return JSON:
{
  "sentiment": "positive|neutral|negative",
  "intent": "interested|not_interested|question|objection|unsubscribe|meeting_request|other",
  "key_facts": ["Facts learned about the prospect/company"],
  "objections": ["Concerns or objections raised"],
  "interests": ["Products or features they showed interest in"],
  "next_steps": ["Any next steps mentioned or implied"],
  "requires_human_handoff": true/false,
  "handoff_reason": "Why human should take over (if applicable)",
  "product_signals": ["Any feature requests, complaints, or product feedback mentioned"],
  "summary": "One sentence summary of the reply"
}

HANDOFF RULES — set requires_human_handoff to true if:
- Lead explicitly asks to speak to a human/real person
- Lead wants to discuss pricing/contracts in detail
- Lead is upset/angry
- Lead wants to schedule a specific meeting
- Lead asks a complex technical question
- Lead mentions a competitor by name and wants comparison`;

  const { data } = await callLLMJson<ReplyAnalysis>(prompt, {
    model: 'haiku',
    max_tokens: 512,
    temperature: 0.1,
  });

  return data;
}

/**
 * Handle unsubscribe intent from reply.
 */
async function handleUnsubscribe(
  supabase: ReturnType<typeof getSupabaseClient>,
  leadId: string,
  orgId: string,
  channel: string
): Promise<void> {
  // Get lead email/phone
  const { data: lead } = await supabase
    .from('mkt_leads')
    .select('email, phone')
    .eq('id', leadId)
    .single();

  if (lead) {
    await supabase.from('mkt_unsubscribes').upsert(
      {
        org_id: orgId,
        lead_id: leadId,
        email: lead.email,
        phone: lead.phone,
        channel,
        reason: 'Replied to unsubscribe',
      },
      { onConflict: 'org_id,email,channel' }
    );
  }

  // Cancel active enrollments
  await supabase
    .from('mkt_sequence_enrollments')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: 'Lead requested unsubscribe via reply',
    })
    .eq('lead_id', leadId)
    .eq('status', 'active');
}

/**
 * Handle human handoff — pause the sequence and create a task/notification.
 */
async function handleHumanHandoff(
  supabase: ReturnType<typeof getSupabaseClient>,
  leadId: string,
  orgId: string,
  channel: string,
  analysis: ReplyAnalysis,
  originalMessage: string
): Promise<void> {
  // Pause active enrollments
  await supabase
    .from('mkt_sequence_enrollments')
    .update({ status: 'paused' })
    .eq('lead_id', leadId)
    .eq('status', 'active');

  // Get lead info for the notification
  const { data: lead } = await supabase
    .from('mkt_leads')
    .select('first_name, last_name, email, phone, company, contact_id')
    .eq('id', leadId)
    .single();

  // Create a contact activity/task for human follow-up
  const contactId = lead?.contact_id;
  if (contactId) {
    await supabase.from('contact_activities').insert({
      org_id: orgId,
      contact_id: contactId,
      activity_type: 'task',
      subject: `[Revenue Engine] Human Follow-up Required — ${analysis.intent}`,
      description: `Lead replied via ${channel}. Sequence paused for human handoff.

**Reason:** ${analysis.handoff_reason || analysis.intent}
**Sentiment:** ${analysis.sentiment}
**Summary:** ${analysis.summary}

**Original message:**
${originalMessage.substring(0, 500)}

**Next steps suggested:**
${analysis.next_steps.map((s) => `- ${s}`).join('\n') || 'None identified'}`,
    });
  }
}

/**
 * Update engagement score for reply events.
 */
async function updateReplyEngagementScore(
  supabase: ReturnType<typeof getSupabaseClient>,
  leadId: string,
  orgId: string,
  sentiment: string
): Promise<void> {
  const delta = sentiment === 'positive' ? 10 : sentiment === 'neutral' ? 7 : 5;

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
      reason: `${sentiment} reply received`,
      triggered_by: 'reply',
    });
  } catch (err) {
    console.error('[mkt-reply-handler] Score update failed:', err);
  }
}
