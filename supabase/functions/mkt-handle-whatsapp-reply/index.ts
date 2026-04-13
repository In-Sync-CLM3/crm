import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLM } from '../_shared/llmClient.ts';
import { updateMemory } from '../_shared/conversationMemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ReplyIntent = 'interested' | 'objection' | 'unsubscribe' | 'out_of_office' | 'other';

interface HandleWAReplyRequest {
  phone: string;           // Lead's phone number
  message_text: string;    // Inbound message body
  profile_name?: string;   // WhatsApp display name
  exotel_sid?: string;     // Exotel message SID
}

async function classifyIntent(text: string): Promise<{
  intent: ReplyIntent;
  summary: string;
  key_facts: string[];
  objections: string[];
  interests: string[];
}> {
  const prompt = `Classify the intent of this WhatsApp reply from a marketing prospect.

MESSAGE: ${text.substring(0, 800)}

Classify as one of:
- "interested": positive, wants to know more, asks product questions
- "objection": raises concerns, not interested now, ask to contact later
- "unsubscribe": wants to stop receiving messages ("stop", "unsubscribe", "remove me")
- "out_of_office": automated or clearly irrelevant/accidental reply
- "other": anything else

Return ONLY a JSON object:
{
  "intent": "interested|objection|unsubscribe|out_of_office|other",
  "summary": "1-2 sentence summary of what the prospect said",
  "key_facts": [],
  "objections": [],
  "interests": []
}`;

  try {
    const response = await callLLM(prompt, {
      model: 'haiku',
      max_tokens: 256,
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
      summary: parsed.summary || `WhatsApp reply: ${text.substring(0, 100)}`,
      key_facts: parsed.key_facts || [],
      objections: parsed.objections || [],
      interests: parsed.interests || [],
    };
  } catch {
    return {
      intent: 'other',
      summary: `WhatsApp reply: ${text.substring(0, 100)}`,
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

  const logger = createEngineLogger('mkt-handle-whatsapp-reply');

  try {
    const supabase = getSupabaseClient();
    const body: HandleWAReplyRequest = await req.json();
    const { phone, message_text, profile_name, exotel_sid } = body;

    if (!phone || !message_text) {
      return new Response(
        JSON.stringify({ error: 'phone and message_text are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalise phone — try with and without leading +
    const phoneVariants = [phone, phone.replace(/^\+/, ''), `+${phone.replace(/^\+/, '')}`];

    // Find lead by phone
    const { data: lead } = await supabase
      .from('mkt_leads')
      .select('id, org_id, first_name, email, status, intent_score')
      .or(phoneVariants.map(p => `phone.eq.${p}`).join(','))
      .limit(1)
      .maybeSingle();

    if (!lead) {
      console.log(`[mkt-handle-whatsapp-reply] No mkt_lead found for phone ${phone}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Acknowledged (lead not found)' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { id: lead_id, org_id } = lead;

    // Find most recent sent WhatsApp action for this lead
    const { data: enrollments } = await supabase
      .from('mkt_sequence_enrollments')
      .select('id')
      .eq('lead_id', lead_id);

    if (!enrollments?.length) {
      return new Response(
        JSON.stringify({ success: true, message: 'Acknowledged (no enrollments)' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const enrollmentIds = enrollments.map((e: any) => e.id);

    const { data: action } = await supabase
      .from('mkt_sequence_actions')
      .select('id, enrollment_id, status')
      .in('enrollment_id', enrollmentIds)
      .eq('channel', 'whatsapp')
      .in('status', ['sent', 'delivered'])
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!action) {
      console.log(`[mkt-handle-whatsapp-reply] No active WA action found for lead ${lead_id}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Acknowledged (no active action)' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[mkt-handle-whatsapp-reply] Processing reply for action=${action.id} lead=${lead_id}`);

    // Classify intent
    const classification = await classifyIntent(message_text);
    console.log(`[mkt-handle-whatsapp-reply] Intent: ${classification.intent}`);

    // Mark action as replied
    await supabase
      .from('mkt_sequence_actions')
      .update({
        status: 'replied',
        replied_at: new Date().toISOString(),
        metadata: {
          reply_intent: classification.intent,
          reply_preview: message_text.substring(0, 600),
          reply_from_name: profile_name,
          exotel_sid,
        },
      })
      .eq('id', action.id);

    if (classification.intent === 'unsubscribe') {
      // Cancel enrollment + mark lead unsubscribed
      await supabase
        .from('mkt_sequence_enrollments')
        .update({ status: 'cancelled', cancel_reason: 'unsubscribed', cancelled_at: new Date().toISOString() })
        .eq('id', action.enrollment_id);

      await supabase
        .from('mkt_leads')
        .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
        .eq('id', lead_id);

      // Add to unsubscribes table
      await supabase.from('mkt_unsubscribes').upsert(
        { org_id, lead_id, email: lead.email, channel: 'whatsapp', reason: 'Replied STOP on WhatsApp' },
        { onConflict: 'org_id,email,channel' }
      );
    } else if (classification.intent !== 'out_of_office') {
      // Pause enrollment for interested/objection/other
      await supabase
        .from('mkt_sequence_enrollments')
        .update({ status: 'paused', cancel_reason: 'lead_replied' })
        .eq('id', action.enrollment_id)
        .eq('status', 'active');

      await supabase
        .from('mkt_leads')
        .update({ status: 'replied', last_contact_at: new Date().toISOString() })
        .eq('id', lead_id);

      // Boost intent score for interested
      if (classification.intent === 'interested') {
        const newScore = Math.min(100, (lead.intent_score || 50) + 20);
        await supabase.from('mkt_leads').update({ intent_score: newScore }).eq('id', lead_id);
      }
    }

    // Update conversation memory
    await updateMemory(lead_id, org_id, 'whatsapp', {
      direction: 'inbound',
      summary: classification.summary,
      details: { intent: classification.intent, channel: 'whatsapp' },
      key_facts: classification.key_facts,
      objections: classification.objections,
      interests: classification.interests,
      next_steps: classification.intent === 'interested'
        ? ['Follow up via WhatsApp or call']
        : classification.intent === 'objection'
        ? ['Address objection in next outreach']
        : [],
    });

    await logger.info('whatsapp-reply-handled', {
      action_id: action.id,
      lead_id,
      intent: classification.intent,
      phone,
    }, {});

    return new Response(
      JSON.stringify({ success: true, lead_id, intent: classification.intent }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[mkt-handle-whatsapp-reply] Fatal:', error);
    await logger.error('whatsapp-reply-failed', error).catch(() => {});
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
