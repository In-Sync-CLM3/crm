import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { updateMemory } from '../_shared/conversationMemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Handles email events:
 * 1. Resend webhook events (delivered, opened, clicked, bounced, complained)
 * 2. Open tracking pixel requests
 * 3. Click tracking redirects
 * 4. Unsubscribe requests
 */
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  // Handle tracking pixel (GET request)
  if (action === 'open') {
    return handleOpenTracking(url);
  }

  // Handle click tracking (GET request)
  if (action === 'click') {
    return handleClickTracking(url);
  }

  // Handle unsubscribe (GET request)
  if (action === 'unsubscribe') {
    return handleUnsubscribe(url);
  }

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle Resend webhook events (POST)
  return handleResendWebhook(req);
});

/**
 * Handle open tracking pixel.
 */
async function handleOpenTracking(url: URL): Promise<Response> {
  const trackingId = url.searchParams.get('id');
  if (!trackingId) {
    return new Response('', { status: 204 });
  }

  // Extract action_id from tracking ID (format: mkt_{action_id}_{timestamp})
  const actionId = extractActionId(trackingId);

  if (actionId) {
    const supabase = getSupabaseClient();

    // Update the action record — only first open
    await supabase
      .from('mkt_sequence_actions')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', actionId)
      .is('opened_at', null);

    // Log engagement score delta
    await updateEngagementScore(supabase, actionId, 'email_open', 3);
  }

  // Return 1x1 transparent GIF
  const pixel = new Uint8Array([
    71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 255, 255, 255, 0, 0, 0,
    33, 249, 4, 0, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1,
    0, 59,
  ]);

  return new Response(pixel, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

/**
 * Handle click tracking — redirect to original URL.
 */
async function handleClickTracking(url: URL): Promise<Response> {
  const trackingId = url.searchParams.get('id');
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing URL', { status: 400 });
  }

  const decodedUrl = decodeURIComponent(targetUrl);

  if (trackingId) {
    const actionId = extractActionId(trackingId);

    if (actionId) {
      const supabase = getSupabaseClient();

      // Update the action record — only first click
      await supabase
        .from('mkt_sequence_actions')
        .update({ clicked_at: new Date().toISOString() })
        .eq('id', actionId)
        .is('clicked_at', null);

      // Log engagement score delta
      await updateEngagementScore(supabase, actionId, 'email_click', 5);
    }
  }

  // Redirect to the original URL
  return new Response(null, {
    status: 302,
    headers: { Location: decodedUrl },
  });
}

/**
 * Handle unsubscribe request.
 */
async function handleUnsubscribe(url: URL): Promise<Response> {
  const token = url.searchParams.get('token');
  const leadId = url.searchParams.get('lead_id');
  const orgId = url.searchParams.get('org_id');

  if (!leadId || !orgId) {
    return new Response(unsubscribeHtml('Invalid unsubscribe link.', false), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const supabase = getSupabaseClient();

  // Get lead email
  const { data: lead } = await supabase
    .from('mkt_leads')
    .select('email')
    .eq('id', leadId)
    .single();

  if (lead?.email) {
    // Insert unsubscribe record
    await supabase.from('mkt_unsubscribes').upsert(
      {
        org_id: orgId,
        lead_id: leadId,
        email: lead.email,
        channel: 'email',
        reason: 'User clicked unsubscribe link',
      },
      { onConflict: 'org_id,email,channel' }
    );

    // Cancel any active enrollments
    await supabase
      .from('mkt_sequence_enrollments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: 'Unsubscribed',
      })
      .eq('lead_id', leadId)
      .eq('status', 'active');
  }

  const logger = createEngineLogger('mkt-email-webhook', orgId);
  await logger.info('unsubscribe', { lead_id: leadId, email: lead?.email });

  return new Response(
    unsubscribeHtml('You have been successfully unsubscribed. You will no longer receive marketing emails from us.', true),
    { headers: { 'Content-Type': 'text/html' } }
  );
}

/**
 * Handle Resend webhook POST events.
 */
async function handleResendWebhook(req: Request): Promise<Response> {
  const logger = createEngineLogger('mkt-email-webhook');

  try {
    const payload = await req.json();
    const eventType = payload.type; // email.delivered, email.opened, email.clicked, email.bounced, email.complained

    if (!eventType) {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabaseClient();
    const data = payload.data || {};
    const tags = data.tags || [];

    // Only process mkt-engine emails
    if (!tags.includes('mkt-engine')) {
      return new Response(JSON.stringify({ received: true, skipped: 'not-mkt-engine' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the action by external_id (Resend message ID)
    const messageId = data.email_id || data.message_id;
    if (!messageId) {
      return new Response(JSON.stringify({ received: true, skipped: 'no-message-id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: action } = await supabase
      .from('mkt_sequence_actions')
      .select('id, enrollment_id, org_id')
      .eq('external_id', messageId)
      .single();

    if (!action) {
      return new Response(JSON.stringify({ received: true, skipped: 'action-not-found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update action based on event type
    const updates: Record<string, unknown> = {};

    switch (eventType) {
      case 'email.delivered':
        updates.status = 'delivered';
        updates.delivered_at = new Date().toISOString();
        break;
      case 'email.opened':
        updates.opened_at = new Date().toISOString();
        await updateEngagementScore(supabase, action.id, 'email_open', 3);
        break;
      case 'email.clicked':
        updates.clicked_at = new Date().toISOString();
        await updateEngagementScore(supabase, action.id, 'email_click', 5);
        break;
      case 'email.bounced':
        updates.status = 'bounced';
        updates.failed_at = new Date().toISOString();
        updates.failure_reason = `Bounced: ${data.bounce_type || 'unknown'}`;
        break;
      case 'email.complained':
        updates.status = 'bounced';
        updates.failure_reason = 'Spam complaint';
        break;
      default:
        break;
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('mkt_sequence_actions')
        .update(updates)
        .eq('id', action.id);
    }

    // Update A/B test metrics if applicable
    await updateABTestMetrics(supabase, action.id, eventType);

    await logger.info('webhook-processed', {
      event_type: eventType,
      action_id: action.id,
      message_id: messageId,
    });

    return new Response(
      JSON.stringify({ received: true, processed: eventType }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('webhook-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Update engagement score delta for a lead.
 */
async function updateEngagementScore(
  supabase: ReturnType<typeof getSupabaseClient>,
  actionId: string,
  eventType: string,
  scoreDelta: number
): Promise<void> {
  try {
    // Get the lead_id from enrollment
    const { data: action } = await supabase
      .from('mkt_sequence_actions')
      .select('enrollment_id, org_id')
      .eq('id', actionId)
      .single();

    if (!action) return;

    const { data: enrollment } = await supabase
      .from('mkt_sequence_enrollments')
      .select('lead_id')
      .eq('id', action.enrollment_id)
      .single();

    if (!enrollment) return;

    // Get current scores
    const { data: currentScores } = await supabase
      .from('mkt_lead_scores')
      .select('engagement_score, total_score')
      .eq('lead_id', enrollment.lead_id)
      .single();

    if (!currentScores) return;

    const newEngagement = Math.min(30, (currentScores.engagement_score || 0) + scoreDelta);
    const newTotal = (currentScores.total_score || 0) - (currentScores.engagement_score || 0) + newEngagement;

    // Update scores
    await supabase
      .from('mkt_lead_scores')
      .update({
        engagement_score: newEngagement,
        total_score: newTotal,
        scored_at: new Date().toISOString(),
      })
      .eq('lead_id', enrollment.lead_id);

    // Update lead record too
    await supabase
      .from('mkt_leads')
      .update({
        engagement_score: newEngagement,
        total_score: newTotal,
      })
      .eq('id', enrollment.lead_id);

    // Log history
    await supabase.from('mkt_lead_score_history').insert({
      org_id: action.org_id,
      lead_id: enrollment.lead_id,
      previous_total: currentScores.total_score,
      new_total: newTotal,
      engagement_delta: scoreDelta,
      reason: eventType,
      triggered_by: eventType,
    });
  } catch (error) {
    console.error('[mkt-email-webhook] Score update failed:', error);
  }
}

/**
 * Update A/B test metrics based on email events.
 */
async function updateABTestMetrics(
  supabase: ReturnType<typeof getSupabaseClient>,
  actionId: string,
  eventType: string
): Promise<void> {
  try {
    const { data: action } = await supabase
      .from('mkt_sequence_actions')
      .select('variant, step_id')
      .eq('id', actionId)
      .single();

    if (!action?.variant || !action.step_id) return;

    // Get the A/B test for this step
    const { data: step } = await supabase
      .from('mkt_campaign_steps')
      .select('ab_test_id')
      .eq('id', action.step_id)
      .single();

    if (!step?.ab_test_id) return;

    const metricMap: Record<string, string> = {
      'email.opened': 'opens',
      'email.clicked': 'clicks',
    };

    const metric = metricMap[eventType];
    if (!metric) return;

    // Get current results and increment
    const { data: result } = await supabase
      .from('mkt_ab_test_results')
      .select(`${metric}`)
      .eq('ab_test_id', step.ab_test_id)
      .eq('variant', action.variant)
      .single();

    if (result) {
      const currentValue = (result as Record<string, number>)[metric] || 0;
      await supabase
        .from('mkt_ab_test_results')
        .update({ [metric]: currentValue + 1 })
        .eq('ab_test_id', step.ab_test_id)
        .eq('variant', action.variant);
    }
  } catch (error) {
    console.error('[mkt-email-webhook] A/B update failed:', error);
  }
}

/**
 * Extract action_id from tracking pixel ID (format: mkt_{action_id}_{timestamp}).
 */
function extractActionId(trackingId: string): string | null {
  if (!trackingId.startsWith('mkt_')) return null;
  const parts = trackingId.split('_');
  // action_id is a UUID, so parts[1] through parts[5] form the UUID
  if (parts.length >= 7) {
    return parts.slice(1, 6).join('-');
  }
  return null;
}

/**
 * Generate a simple unsubscribe confirmation HTML page.
 */
function unsubscribeHtml(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html>
<head><title>Unsubscribe</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f9fafb; }
  .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h1 { font-size: 20px; color: #111827; margin-bottom: 8px; }
  p { color: #6b7280; font-size: 14px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '&#10003;' : '&#10007;'}</div>
    <h1>${success ? 'Unsubscribed' : 'Error'}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
