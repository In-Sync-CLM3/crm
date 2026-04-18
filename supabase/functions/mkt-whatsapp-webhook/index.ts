import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { updateMemory } from '../_shared/conversationMemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Receives Exotel WhatsApp status callbacks and inbound messages.
 * Updates mkt_sequence_actions and triggers reply handling.
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

    // Exotel sends different payload structures for status vs inbound
    const messages = payload?.whatsapp?.messages || payload?.messages || [];
    const statuses = payload?.whatsapp?.statuses || payload?.statuses || [];

    // Log raw payload once for debugging — helps trace Exotel callback format
    await logger.info('webhook-received', {
      has_statuses: statuses.length > 0,
      has_messages: messages.length > 0,
      has_custom_data: !!payload.custom_data,
      root_status: payload.status ?? null,
      first_status: statuses[0] ?? null,
    });

    // Handle status updates (delivery, read receipts)
    for (const status of statuses) {
      await handleStatusUpdate(supabase, status, logger);
    }

    // Handle inbound messages (replies)
    for (const message of messages) {
      await handleInboundMessage(supabase, supabaseUrl, serviceRoleKey, message, logger);
    }

    // Handle custom_data callbacks — action_id-based update.
    // Exotel may send the delivery status at root level (payload.status) OR
    // nested inside payload.whatsapp.statuses[0].status — check both.
    if (payload.custom_data) {
      try {
        const customData = typeof payload.custom_data === 'string'
          ? JSON.parse(payload.custom_data)
          : payload.custom_data;

        if (customData.action_id) {
          const callbackStatus =
            payload.status ??
            payload.whatsapp?.statuses?.[0]?.status ??
            payload.statuses?.[0]?.status ??
            null;

          if (callbackStatus) {
            await handleStatusByActionId(supabase, customData, String(callbackStatus).toLowerCase(), logger);
          }
        }
      } catch {
        // custom_data might not be JSON
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
 * Handle WhatsApp delivery status updates.
 */
async function handleStatusUpdate(
  supabase: ReturnType<typeof getSupabaseClient>,
  status: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  const messageSid = status.id as string || status.sid as string;
  if (!messageSid) return;

  const statusType = ((status.status as string) || '').toLowerCase();

  // Find the action by external_id (the message SID stored at send time)
  const { data: action } = await supabase
    .from('mkt_sequence_actions')
    .select('id, enrollment_id')
    .eq('external_id', messageSid)
    .maybeSingle();

  if (!action) {
    await logger.info('status-no-action-match', { message_sid: messageSid, status: statusType });
    return;
  }

  const updates: Record<string, unknown> = {};

  switch (statusType) {
    case 'delivered':
      updates.status = 'delivered';
      updates.delivered_at = new Date().toISOString();
      break;
    case 'read':
      updates.opened_at = new Date().toISOString();
      break;
    case 'failed':
    case 'undeliverable':
      updates.status = 'failed';
      updates.failed_at = new Date().toISOString();
      updates.failure_reason = (status.errors as Array<{ title: string }>)?.[0]?.title || 'Delivery failed';
      break;
  }

  if (Object.keys(updates).length > 0) {
    await supabase
      .from('mkt_sequence_actions')
      .update(updates)
      .eq('id', action.id);

    await logger.info('status-updated', {
      action_id: action.id,
      status: statusType,
      message_sid: messageSid,
    });
  }
}

/**
 * Handle status update when we have action_id in custom_data.
 */
async function handleStatusByActionId(
  supabase: ReturnType<typeof getSupabaseClient>,
  customData: { action_id: string; lead_id?: string; enrollment_id?: string },
  status: string,
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  const updates: Record<string, unknown> = {};

  const s = status.toLowerCase();
  switch (s) {
    case 'delivered':
    case 'sent':
      updates.status = 'delivered';
      updates.delivered_at = new Date().toISOString();
      break;
    case 'read':
      updates.opened_at = new Date().toISOString();
      break;
    case 'failed':
    case 'undeliverable':
      updates.status = 'failed';
      updates.failed_at = new Date().toISOString();
      break;
  }

  if (Object.keys(updates).length > 0) {
    await supabase
      .from('mkt_sequence_actions')
      .update(updates)
      .eq('id', customData.action_id);
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

  // Try to match the phone number to a lead
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

  // Find active enrollment for this lead, then mark the latest action as replied
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

  // Update conversation memory
  await updateMemory(lead.id, lead.org_id, 'whatsapp', {
    direction: 'inbound',
    summary: `WhatsApp reply: ${text.substring(0, 200)}`,
    details: { full_text: text, from },
  });

  // Forward to reply-handler for NLP processing
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

/**
 * Normalize phone number for matching.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}
