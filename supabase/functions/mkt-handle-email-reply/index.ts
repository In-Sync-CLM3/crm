import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLM } from '../_shared/llmClient.ts';
import { updateMemory } from '../_shared/conversationMemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ReplyIntent = 'interested' | 'objection' | 'unsubscribe' | 'out_of_office' | 'other';

interface HandleEmailReplyRequest {
  from_email: string;
  from_name?: string;
  subject: string;
  text: string;
  html?: string;
  message_id?: string;
  in_reply_to?: string;  // Original message ID — used to look up the action
}

async function classifyReplyIntent(
  subject: string,
  text: string
): Promise<{ intent: ReplyIntent; summary: string; key_facts: string[]; objections: string[]; interests: string[] }> {
  const prompt = `Classify the intent of this email reply from a marketing prospect.

SUBJECT: ${subject}
BODY:
${text.substring(0, 1000)}

Classify as one of:
- "interested": positive response, wants to learn more, asks questions about the product
- "objection": raises concerns, not interested right now, asks to be contacted later
- "unsubscribe": explicitly asks to unsubscribe, stop emails, remove from list
- "out_of_office": automated out-of-office or vacation reply
- "other": anything else

Return ONLY a JSON object:
{
  "intent": "interested|objection|unsubscribe|out_of_office|other",
  "summary": "1-2 sentence summary of what the prospect said",
  "key_facts": ["any facts about the prospect's situation"],
  "objections": ["any objections or concerns raised"],
  "interests": ["any specific interests or questions mentioned"]
}`;

  try {
    const response = await callLLM(prompt, {
      model: 'haiku',
      max_tokens: 300,
      temperature: 0.2,
      json_mode: true,
    });

    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    return {
      intent: parsed.intent || 'other',
      summary: parsed.summary || `Reply from prospect: ${subject}`,
      key_facts: parsed.key_facts || [],
      objections: parsed.objections || [],
      interests: parsed.interests || [],
    };
  } catch (err) {
    console.error('[mkt-handle-email-reply] Intent classification failed:', err);
    return {
      intent: 'other',
      summary: `Reply from prospect: ${subject}`,
      key_facts: [],
      objections: [],
      interests: [],
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-handle-email-reply');

  try {
    const supabase = getSupabaseClient();
    const body: HandleEmailReplyRequest = await req.json();
    const { from_email, from_name, subject, text, html, message_id, in_reply_to } = body;

    if (!from_email) {
      return new Response(
        JSON.stringify({ error: 'from_email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Look up the action via In-Reply-To header — strip angle brackets and match external_id
    // In-Reply-To format: "<resend-uuid@resend.dev>" or just the raw ID
    const rawReplyTo = (in_reply_to || '').replace(/[<>]/g, '').trim();
    // external_id stored as Resend's message UUID — try matching full string or just the UUID part
    const replyToId = rawReplyTo.split('@')[0] || rawReplyTo;

    let action: { id: string; enrollment_id: string; lead_id: string; org_id: string; status: string } | null = null;

    if (replyToId) {
      const { data } = await supabase
        .from('mkt_sequence_actions')
        .select('id, enrollment_id, lead_id, org_id, status')
        .or(`external_id.eq.${rawReplyTo},external_id.eq.${replyToId}`)
        .eq('channel', 'email')
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();
      action = data;
    }

    // Fallback: find by lead email if In-Reply-To didn't match
    if (!action && from_email) {
      console.log(`[mkt-handle-email-reply] In-Reply-To lookup failed for "${replyToId}", falling back to lead email`);
      const { data: lead } = await supabase
        .from('mkt_leads')
        .select('id, org_id')
        .eq('email', from_email)
        .limit(1)
        .single();

      if (lead) {
        const { data } = await supabase
          .from('mkt_sequence_actions')
          .select('id, enrollment_id, lead_id, org_id, status')
          .eq('lead_id', lead.id)
          .eq('channel', 'email')
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })
          .limit(1)
          .single();
        action = data;
      }
    }

    if (!action) {
      console.log('[mkt-handle-email-reply] No action found for reply, acknowledging without processing');
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook acknowledged (action not found)' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { id: action_id, enrollment_id, lead_id, org_id } = action;
    console.log(`[mkt-handle-email-reply] Processing reply for action=${action_id} lead=${lead_id} enrollment=${enrollment_id}`);

    // Classify intent
    const classification = await classifyReplyIntent(subject || '', text || '');
    console.log(`[mkt-handle-email-reply] Intent: ${classification.intent} — ${classification.summary}`);

    // Mark action as replied
    await supabase
      .from('mkt_sequence_actions')
      .update({
        status: 'replied',
        replied_at: new Date().toISOString(),
        metadata: {
          reply_intent: classification.intent,
          reply_subject: subject,
          reply_preview: (text || '').substring(0, 600).trim(),
          reply_from_name: from_name,
          reply_message_id: message_id,
          in_reply_to,
        },
      })
      .eq('id', action_id);

    // Handle enrollment based on intent
    if (classification.intent === 'unsubscribe') {
      // Cancel enrollment and mark lead as unsubscribed
      await supabase
        .from('mkt_sequence_enrollments')
        .update({
          status: 'cancelled',
          cancel_reason: 'unsubscribed',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', enrollment_id);

      await supabase
        .from('mkt_leads')
        .update({
          status: 'unsubscribed',
          unsubscribed_at: new Date().toISOString(),
        })
        .eq('id', lead_id);

      console.log(`[mkt-handle-email-reply] Unsubscribed lead ${lead_id}`);
    } else {
      // Pause enrollment for all other reply types (human needs to follow up)
      await supabase
        .from('mkt_sequence_enrollments')
        .update({
          status: 'paused',
          cancel_reason: 'lead_replied',
        })
        .eq('id', enrollment_id)
        .eq('status', 'active'); // only pause if still active

      // Update lead status and intent score based on classification
      const leadUpdate: Record<string, unknown> = {
        last_contact_at: new Date().toISOString(),
      };

      if (classification.intent === 'interested') {
        leadUpdate.status = 'replied';
      } else if (classification.intent === 'objection') {
        leadUpdate.status = 'replied';
      } else if (classification.intent === 'out_of_office') {
        // Don't change status for OOO — resume enrollment after delay
        // Re-activate enrollment
        await supabase
          .from('mkt_sequence_enrollments')
          .update({
            status: 'active',
            cancel_reason: null,
          })
          .eq('id', enrollment_id)
          .eq('status', 'paused');
      }

      if (classification.intent !== 'out_of_office') {
        await supabase.from('mkt_leads').update(leadUpdate).eq('id', lead_id);
      }

      // Boost intent score for interested replies
      if (classification.intent === 'interested') {
        const { data: leadData } = await supabase
          .from('mkt_leads')
          .select('intent_score')
          .eq('id', lead_id)
          .single();

        if (leadData) {
          const newScore = Math.min(100, (leadData.intent_score || 50) + 20);
          await supabase
            .from('mkt_leads')
            .update({ intent_score: newScore })
            .eq('id', lead_id);
        }
      }
    }

    // Update conversation memory
    await updateMemory(lead_id, org_id, 'email', {
      direction: 'inbound',
      summary: classification.summary,
      details: {
        intent: classification.intent,
        subject,
        from_email,
      },
      key_facts: classification.key_facts,
      objections: classification.objections,
      interests: classification.interests,
      next_steps: classification.intent === 'interested'
        ? ['Follow up with personalized response to their reply']
        : classification.intent === 'objection'
        ? ['Address objection in next outreach']
        : [],
    });

    await logger.info('email-reply-handled', {
      action_id,
      lead_id,
      enrollment_id,
      intent: classification.intent,
      from_email,
    }, {});

    return new Response(
      JSON.stringify({
        success: true,
        action_id,
        lead_id,
        intent: classification.intent,
        summary: classification.summary,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[mkt-handle-email-reply] Fatal error:', error);
    await logger.error('email-reply-failed', error).catch(() => {});
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
