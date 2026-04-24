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
 * Exotel DLR payload structure (confirmed via live testing 2026-04-18, commit 2391fd4):
 *
 *   DLR path 1 — SID-based (payload.whatsapp.statuses[]):
 *     status.id / status.sid → matches external_id stored at send time
 *     status.status          → 'delivered' | 'read' | 'failed'
 *     status.errors[]        → failure details
 *
 *   DLR path 2 — action_id-based (payload.custom_data at root):
 *     payload.custom_data    → JSON: { action_id, lead_id, enrollment_id }
 *     payload.status         → status string (root level)
 *     payload.whatsapp.statuses[0].status → status string (nested fallback)
 *
 *   Inbound replies:
 *     payload.whatsapp.messages[] → text messages from leads
 *
 * NOTE: f179188 incorrectly assumed DLRs arrive as payload.whatsapp.messages[]
 * with callback_type==='dlr'. That format does not match live Exotel behaviour.
 * This file restores the 2391fd4 structure which was verified working.
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

    const messages: Record<string, unknown>[] = payload?.whatsapp?.messages || payload?.messages || [];
    const statuses: Record<string, unknown>[] = payload?.whatsapp?.statuses || payload?.statuses || [];

    await logger.info('webhook-received', {
      has_statuses: statuses.length > 0,
      has_messages: messages.length > 0,
      has_custom_data: !!payload.custom_data,
      root_status: payload.status ?? null,
      first_status: statuses[0] ?? null,
      first_message: messages[0] ?? null,
    });

    // DLR path 1: status objects keyed by message SID
    for (const status of statuses) {
      await handleStatusUpdate(supabase, status, logger);
    }

    // Inbound replies from leads
    for (const message of messages) {
      await handleInboundMessage(supabase, supabaseUrl, serviceRoleKey, message, logger);
    }

    // DLR path 2: root-level custom_data with action_id
    if (payload.custom_data) {
      try {
        const customData = typeof payload.custom_data === 'string'
          ? JSON.parse(payload.custom_data as string)
          : payload.custom_data;

        if (customData.action_id) {
          const callbackStatus: string | null =
            payload.status ??
            payload.whatsapp?.statuses?.[0]?.status ??
            payload.statuses?.[0]?.status ??
            null;

          if (callbackStatus) {
            await handleStatusByActionId(supabase, customData, String(callbackStatus).toLowerCase(), logger);
          } else {
            await logger.info('custom-data-no-status', { action_id: customData.action_id });
          }
        }
      } catch {
        // custom_data is not JSON — ignore
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
 * Handle a DLR arriving via payload.whatsapp.statuses[] (SID-based lookup).
 */
async function handleStatusUpdate(
  supabase: ReturnType<typeof getSupabaseClient>,
  status: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  const messageSid = (status.id as string) || (status.sid as string);
  if (!messageSid) return;

  const statusType = ((status.status as string) || '').toLowerCase();

  const { data: action } = await supabase
    .from('mkt_sequence_actions')
    .select('id, enrollment_id, step_number')
    .eq('external_id', messageSid)
    .maybeSingle();

  if (!action) {
    await logger.info('status-no-action-match', { message_sid: messageSid, status: statusType });
    return;
  }

  const updates: Record<string, unknown> = {};
  const now = new Date().toISOString();

  switch (statusType) {
    case 'delivered':
      updates.status       = 'delivered';
      updates.delivered_at = now;
      break;
    case 'read':
      updates.opened_at = now;
      break;
    case 'failed':
    case 'undeliverable': {
      updates.status         = 'failed';
      updates.failed_at      = now;
      updates.failure_reason = (status.errors as Array<{ title: string }>)?.[0]?.title || 'Delivery failed';

      // Suppress + advance if contact is not registered on WhatsApp
      const reason = ((updates.failure_reason as string) || '').toLowerCase();
      const notOnWa = reason.includes('not able to receive') || reason.includes('not registered');
      if (notOnWa) {
        await suppressAndAdvance(supabase, action, logger);
      }
      break;
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('mkt_sequence_actions').update(updates).eq('id', action.id);
    await logger.info('status-updated', { action_id: action.id, status: statusType, message_sid: messageSid });
  }
}

/**
 * Handle a DLR arriving via root-level payload.custom_data (action_id-based lookup).
 */
async function handleStatusByActionId(
  supabase: ReturnType<typeof getSupabaseClient>,
  customData: { action_id: string; lead_id?: string; enrollment_id?: string },
  status: string,
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  const updates: Record<string, unknown> = {};
  const now = new Date().toISOString();

  switch (status) {
    case 'delivered':
    case 'sent':
      updates.status       = 'delivered';
      updates.delivered_at = now;
      break;
    case 'read':
      updates.opened_at = now;
      break;
    case 'failed':
    case 'undeliverable': {
      updates.status    = 'failed';
      updates.failed_at = now;

      // Check if action exists and handle non-WA contact suppression
      const { data: action } = await supabase
        .from('mkt_sequence_actions')
        .select('id, enrollment_id, step_number')
        .eq('id', customData.action_id)
        .maybeSingle();

      if (action) {
        await suppressAndAdvance(supabase, action, logger);
      }
      break;
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('mkt_sequence_actions').update(updates).eq('id', customData.action_id);
    await logger.info('status-by-action-id-updated', { action_id: customData.action_id, status });
  }
}

/**
 * Suppress a contact from the WhatsApp channel and immediately advance their enrollment.
 * Called when we receive a failure indicating the contact is not on WhatsApp.
 */
async function suppressAndAdvance(
  supabase: ReturnType<typeof getSupabaseClient>,
  action: { id: string; enrollment_id: string; step_number: number },
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  const { data: enrollment } = await supabase
    .from('mkt_sequence_enrollments')
    .select('lead_id, org_id')
    .eq('id', action.enrollment_id)
    .single();

  if (!enrollment) return;

  await supabase.from('mkt_unsubscribes').upsert({
    org_id:  enrollment.org_id,
    lead_id: enrollment.lead_id,
    channel: 'whatsapp',
    reason:  'Not registered on WhatsApp',
  }, { onConflict: 'org_id,lead_id,channel', ignoreDuplicates: true });

  await supabase.rpc('advance_enrollment_step', {
    p_enrollment_id: action.enrollment_id,
    p_current_step:  action.step_number,
  });

  await logger.info('wa-suppressed-and-advanced', {
    lead_id:     enrollment.lead_id,
    step_number: action.step_number,
    reason:      'Not registered on WhatsApp',
  });
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
