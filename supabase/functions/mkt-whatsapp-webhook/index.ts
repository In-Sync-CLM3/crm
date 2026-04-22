import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { updateMemory } from '../_shared/conversationMemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Receives Exotel WhatsApp status callbacks and inbound messages.
 *
 * Exotel callback structure (confirmed via live testing 2026-04-18):
 *   payload.whatsapp.messages[] — contains BOTH outbound DLRs and inbound replies
 *   message.callback_type === 'dlr' → delivery receipt for a message we sent
 *   message.callback_type !== 'dlr' (or absent) → inbound message from user
 *   message.custom_data → the custom_data string we passed when sending (JSON: { action_id, lead_id, enrollment_id })
 *   message.exo_status_code → 0=delivered, 1=sent, non-zero=failed
 *   message.exo_detailed_status → 'DELIVERED', 'READ', 'SENT', 'FAILED', 'EX_REENGAGEMENT_ERROR', etc.
 *   message.sid → message SID (matches external_id stored at send time)
 *
 * Note: payload.whatsapp.statuses[] is NOT used by Exotel — always empty.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-whatsapp-webhook');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const payload = await req.json();

    // All callbacks (DLR + inbound) come via whatsapp.messages[]
    const messages: Record<string, unknown>[] =
      payload?.whatsapp?.messages || payload?.messages || [];

    await logger.info('webhook-received', {
      message_count: messages.length,
      dlr_count: messages.filter((m) => m.callback_type === 'dlr').length,
      inbound_count: messages.filter((m) => m.callback_type !== 'dlr').length,
      payload_keys: Object.keys(payload),
      first_message: messages[0] ?? null,
    });

    for (const message of messages) {
      if (message.callback_type === 'dlr') {
        // Delivery report for a message we sent
        await handleDlr(supabase, message, logger);
      } else {
        // Inbound reply from the user
        await handleInboundMessage(supabase, supabaseUrl, serviceRoleKey, message, logger);
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('whatsapp-webhook-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Handle a DLR (Delivery Report) for an outbound message.
 *
 * Exotel DLR message shape:
 *   { sid, to, timestamp, callback_type: 'dlr', custom_data: '{"action_id":"..."}',
 *     exo_status_code: 0, exo_detailed_status: 'DELIVERED', description: '...' }
 *
 * exo_status_code: 0 = delivered, 1 = sent (accepted), non-zero = failed
 * exo_detailed_status: 'READ' = read receipt
 */
async function handleDlr(
  supabase: ReturnType<typeof getSupabaseClient>,
  message: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  const sid = message.sid as string | undefined;
  const exoCode = message.exo_status_code as number | undefined;
  const exoStatus = ((message.exo_detailed_status as string) || '').toUpperCase();
  const description = message.description as string | undefined;

  // Extract action_id from custom_data (JSON string we passed at send time)
  let actionId: string | null = null;
  if (message.custom_data) {
    try {
      const cd =
        typeof message.custom_data === 'string'
          ? JSON.parse(message.custom_data as string)
          : message.custom_data;
      actionId = (cd as Record<string, string>).action_id || null;
    } catch { /* custom_data may not be JSON */ }
  }

  await logger.info('dlr-received', {
    sid,
    action_id: actionId,
    exo_status_code: exoCode,
    exo_detailed_status: exoStatus,
    description,
  });

  const updates: Record<string, unknown> = {};
  const now = new Date().toISOString();
  const descLower = (description || '').toLowerCase();

  // Exotel quirk: some delivery receipts arrive with non-zero exo_status_code but
  // description clearly indicates success ("message delivered", "message seen").
  // Check description keywords before treating non-zero codes as failures.
  const descIsDelivered = descLower.includes('delivered');
  const descIsSeen      = descLower.includes('seen') || descLower.includes('read');

  if (exoStatus === 'READ' || descIsSeen) {
    updates.opened_at = now;
    // Also mark delivered if not already (READ implies delivered)
    updates.status       = 'delivered';
    updates.delivered_at = now;
  } else if (exoCode === 0 || exoStatus === 'DELIVERED' || descIsDelivered) {
    updates.status       = 'delivered';
    updates.delivered_at = now;
  } else if (exoCode === 1 || exoStatus === 'SENT') {
    // Message accepted by WA network — already marked sent at dispatch; no change needed
  } else {
    // Confirmed failure — record it
    updates.status         = 'failed';
    updates.failed_at      = now;
    updates.failure_reason = description || exoStatus || `Exotel error ${exoCode}`;

    // Issue 7: contact not registered on WhatsApp — suppress them from WA channel
    // so the engine stops retrying via WhatsApp for this contact.
    const notOnWa = descLower.includes('not able to receive') || descLower.includes('not registered');
    if (notOnWa && actionId) {
      const { data: action } = await supabase
        .from('mkt_sequence_actions')
        .select('enrollment_id')
        .eq('id', actionId)
        .single();

      if (action?.enrollment_id) {
        const { data: enrollment } = await supabase
          .from('mkt_sequence_enrollments')
          .select('lead_id, org_id')
          .eq('id', action.enrollment_id)
          .single();

        if (enrollment) {
          // Add to mkt_unsubscribes for whatsapp channel so channelRouter skips WA for this lead
          await supabase.from('mkt_unsubscribes').upsert({
            org_id:  enrollment.org_id,
            lead_id: enrollment.lead_id,
            channel: 'whatsapp',
            reason:  'Not registered on WhatsApp',
          }, { onConflict: 'org_id,lead_id,channel', ignoreDuplicates: true });

          await logger.info('wa-suppressed', {
            lead_id: enrollment.lead_id,
            reason: 'Not registered on WhatsApp',
          });
        }
      }
    }
  }

  if (Object.keys(updates).length === 0) return;

  // Update by action_id (preferred) or fall back to message SID
  if (actionId) {
    await supabase
      .from('mkt_sequence_actions')
      .update(updates)
      .eq('id', actionId);
  } else if (sid) {
    await supabase
      .from('mkt_sequence_actions')
      .update(updates)
      .eq('external_id', sid);
  }
}

/**
 * Handle inbound WhatsApp message (lead reply).
 */
async function handleInboundMessage(
  supabase: ReturnType<typeof getSupabaseClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  message: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  const from = message.from as string;
  const text = (message.text as Record<string, string>)?.body ||
               (message.body as string) ||
               '';

  if (!from || !text) return;

  const normalizedPhone = normalizePhone(from);

  const { data: lead } = await supabase
    .from('mkt_leads')
    .select('id, org_id, campaign_id')
    .or(`phone.eq.${normalizedPhone},phone.eq.+${normalizedPhone},phone.eq.+91${normalizedPhone}`)
    .limit(1)
    .single();

  if (!lead) {
    await logger.info('inbound-unmatched', { from, text_preview: text.substring(0, 50) });
    return;
  }

  const { data: enrollment } = await supabase
    .from('mkt_sequence_enrollments')
    .select('id')
    .eq('lead_id', lead.id)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (enrollment) {
    const { data: latestAction } = await supabase
      .from('mkt_sequence_actions')
      .select('id')
      .eq('enrollment_id', enrollment.id)
      .eq('channel', 'whatsapp')
      .in('status', ['sent', 'delivered'])
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

  await updateMemory(lead.id, lead.org_id, 'whatsapp', {
    direction: 'inbound',
    summary: `WhatsApp reply: ${text.substring(0, 200)}`,
    details: { full_text: text, from },
  });

  try {
    await fetch(`${supabaseUrl}/functions/v1/mkt-reply-handler`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lead_id: lead.id,
        org_id: lead.org_id,
        channel: 'whatsapp',
        message_text: text,
        from,
      }),
    });
  } catch (err) {
    console.error('[mkt-whatsapp-webhook] Reply handler dispatch failed:', err);
  }

  await logger.info('inbound-received', {
    lead_id: lead.id,
    from,
    text_preview: text.substring(0, 50),
  });
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}
