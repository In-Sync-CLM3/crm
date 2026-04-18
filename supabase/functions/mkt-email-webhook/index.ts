import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { updateMemory } from '../_shared/conversationMemory.ts';
import {
  hardSuppressContact,
  softBounceContact,
  suppressContactByEmail,
} from '../_shared/emailSuppression.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE_URL = Deno.env.get('SITE_URL') || 'https://app.in-sync.io';

// ---------------------------------------------------------------------------
// Redirect allowlist — derived from mkt_products (SoT).
// Domains are cached in-process for 60 s; a new product onboarded to
// mkt_products is automatically allowlisted on the next cache refresh.
// Static entries: the app's own SITE_URL hostname is always included.
// ---------------------------------------------------------------------------
let _allowlistCache: { domains: Set<string>; expiresAt: number } | null = null;

async function getAllowedDomains(
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<Set<string>> {
  const now = Date.now();
  if (_allowlistCache && now < _allowlistCache.expiresAt) return _allowlistCache.domains;

  const domains = new Set<string>();

  // Always allow our own app domain
  try { domains.add(new URL(SITE_URL).hostname); } catch { /* ignore */ }

  // Derive from mkt_products — every registered product's URLs are trusted
  const { data } = await supabase.from('mkt_products').select('product_url, payment_url');
  for (const row of data || []) {
    try { if (row.product_url) domains.add(new URL(row.product_url).hostname); } catch { /* ignore */ }
    try { if (row.payment_url) domains.add(new URL(row.payment_url).hostname); } catch { /* ignore */ }
  }

  _allowlistCache = { domains, expiresAt: now + 60_000 };
  return domains;
}

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
    return handleClickTracking(url, req);
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

// Known email security scanner User-Agent patterns.
// These fetch links before delivery to check for malware — not real human clicks.
const SCANNER_UA_PATTERNS = [
  /proofpoint/i,
  /mimecast/i,
  /barracuda/i,
  /ironport/i,
  /symantec.*mail/i,
  /microsoft.*exchange/i,
  /office365/i,
  /defender/i,
  /cloudmark/i,
  /messagelabs/i,
  /trend.*micro/i,
  /forcepoint/i,
  /zscaler/i,
  // Generic bot/scanner patterns
  /^python-requests/i,
  /^libwww/i,
  /^curl\//i,
  /^wget\//i,
  /^java\//i,
  /^apache-httpclient/i,
];

function isSecurityScanner(req: Request): boolean {
  const ua = req.headers.get('user-agent') || '';
  if (!ua) return true; // No UA = almost certainly a scanner
  return SCANNER_UA_PATTERNS.some((p) => p.test(ua));
}

/**
 * Handle click tracking — redirect to original URL.
 * Enforces a domain allowlist derived from mkt_products (SoT).
 * Skips recording if the request looks like an email security scanner.
 */
async function handleClickTracking(url: URL, req: Request): Promise<Response> {
  const startMs = Date.now();
  const trackingId = url.searchParams.get('id');
  const targetUrl = url.searchParams.get('url');
  const channel = url.searchParams.get('channel') || 'email'; // email | whatsapp

  if (!targetUrl) {
    return new Response('Missing URL', { status: 400 });
  }

  const decodedUrl = decodeURIComponent(targetUrl);

  // ---------------------------------------------------------------------------
  // Allowlist check — must pass before any redirect or recording.
  // Prevents use of this endpoint as an open redirector.
  // ---------------------------------------------------------------------------
  const supabase = getSupabaseClient();
  const logger = createEngineLogger('mkt-email-webhook');

  let hostname: string;
  try {
    hostname = new URL(decodedUrl).hostname;
  } catch {
    await logger.warn('allowlist-invalid-url', { url: decodedUrl, channel });
    return new Response(null, { status: 302, headers: { Location: SITE_URL } });
  }

  const allowedDomains = await getAllowedDomains(supabase);
  if (!allowedDomains.has(hostname)) {
    await logger.warn('allowlist-rejection', { hostname, url: decodedUrl, channel });
    return new Response(null, { status: 302, headers: { Location: SITE_URL } });
  }

  // ---------------------------------------------------------------------------
  // Signature verification (v=2 signed links; v=1 legacy with warn log)
  // ---------------------------------------------------------------------------
  const v = url.searchParams.get('v') || '1';
  if (v === '2') {
    const ts = url.searchParams.get('ts');
    const sig = url.searchParams.get('sig');
    const hmacSecret = Deno.env.get('MKT_CLICK_HMAC_SECRET');
    const actionIdForSig = trackingId ? extractActionId(trackingId) : null;

    if (!ts || !sig || !actionIdForSig || !hmacSecret) {
      await logger.warn('sig-missing-params', { v, channel });
      return new Response(null, { status: 302, headers: { Location: SITE_URL } });
    }

    // Reject links older than 90 days
    const linkAge = Date.now() - parseInt(ts, 10);
    if (linkAge > 90 * 24 * 60 * 60 * 1000) {
      await logger.warn('sig-expired', { action_id: actionIdForSig, age_days: Math.floor(linkAge / 86400000), channel });
      return new Response(null, { status: 302, headers: { Location: SITE_URL } });
    }

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(hmacSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const expectedBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${actionIdForSig}|${ts}`)
    );
    const expectedSig = Array.from(new Uint8Array(expectedBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (sig !== expectedSig) {
      await logger.warn('sig-invalid', { action_id: actionIdForSig, channel });
      return new Response(null, { status: 302, headers: { Location: SITE_URL } });
    }
  } else {
    // v=1: legacy unsigned link — allow but warn so we know when it's safe to remove fallback
    await logger.warn('sig-v1-legacy', { tracking_id: trackingId, channel });
  }

  // ---------------------------------------------------------------------------
  // Record click — log every event; score only real, non-duplicate clicks.
  // ---------------------------------------------------------------------------
  const clickedAt = new Date();
  const actionId = trackingId ? extractActionId(trackingId) : null;

  // Determine if bot (UA check already run above; add timing heuristic here)
  const uaBot = isSecurityScanner(req);
  let isBotClick = uaBot;
  let botReason: string | null = uaBot ? 'ua_match' : null;

  // Fetch action for timing heuristic + contact_id
  let contactId: string | null = null;
  let orgId: string | null = null;
  if (actionId) {
    const { data: action } = await supabase
      .from('mkt_sequence_actions')
      .select('org_id, enrollment_id, sent_at, clicked_at')
      .eq('id', actionId)
      .single();

    if (action) {
      orgId = action.org_id;

      // Timing heuristic: click within 2 s of send = almost certainly a scanner
      if (!isBotClick && action.sent_at) {
        const msSinceSend = clickedAt.getTime() - new Date(action.sent_at).getTime();
        if (msSinceSend >= 0 && msSinceSend < 2000) {
          isBotClick = true;
          botReason = 'timing_heuristic';
        }
      }

      // Resolve contact_id from enrollment
      if (action.enrollment_id) {
        const { data: enr } = await supabase
          .from('mkt_sequence_enrollments')
          .select('lead_id')
          .eq('id', action.enrollment_id)
          .single();
        if (enr?.lead_id) contactId = enr.lead_id;
      }

      // Stamp first-touch clicked_at on action record (real humans only)
      if (!isBotClick && !action.clicked_at) {
        await supabase
          .from('mkt_sequence_actions')
          .update({ clicked_at: clickedAt.toISOString() })
          .eq('id', actionId)
          .is('clicked_at', null);
      }
    }
  }

  // Dedup check: same action + url within 3 s → mark as duplicate, skip scoring
  let isDuplicate = false;
  if (actionId && !isBotClick) {
    const windowStart = new Date(clickedAt.getTime() - 3000).toISOString();
    const { count } = await supabase
      .from('mkt_click_events')
      .select('id', { count: 'exact', head: true })
      .eq('action_id', actionId)
      .eq('url', decodedUrl)
      .eq('is_bot', false)
      .gte('clicked_at', windowStart);
    if ((count || 0) > 0) isDuplicate = true;
  }

  // Hash IP for storage (never log raw IP)
  const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  let ipHash = '';
  if (rawIp) {
    const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawIp));
    ipHash = Array.from(new Uint8Array(hashBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Insert event row (every click, including bots and duplicates)
  if (actionId && orgId) {
    await supabase.from('mkt_click_events').insert({
      org_id: orgId,
      action_id: actionId,
      contact_id: contactId,
      channel,
      url: decodedUrl,
      clicked_at: clickedAt.toISOString(),
      user_agent: req.headers.get('user-agent') || null,
      ip_hash: ipHash || null,
      is_bot: isBotClick,
      bot_reason: botReason,
      is_duplicate: isDuplicate,
    });
  }

  // Score engagement: real humans, first-touch only
  if (actionId && !isBotClick && !isDuplicate) {
    await updateEngagementScore(supabase, actionId, 'email_click', 5);
  }

  await logger.info('click-redirect', {
    action_id: actionId,
    channel,
    is_bot: isBotClick,
    is_duplicate: isDuplicate,
    duration_ms: Date.now() - startMs,
  });

  // Redirect to the verified destination
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
    .from('contacts')
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
    const tagNames = Array.isArray(tags)
      ? tags.map((t: Record<string, unknown>) => typeof t === 'string' ? t : t.name)
      : [];

    // Handle verification emails (tagged mkt_verification) — only care about hard bounces
    if (tagNames.includes('mkt_verification')) {
      if (eventType === 'email.bounced') {
        const bounceType = (data.bounce_type as string || '').toLowerCase();
        const isHard = bounceType === 'hard' || bounceType === '' || bounceType === 'unknown';
        if (isHard) {
          const toEmail = Array.isArray(data.to) ? data.to[0] : data.to;
          if (toEmail) {
            const r = await suppressContactByEmail(supabase, toEmail as string);
            if (r.suppressed) await logger.info('verification-bounce-suppressed', { email: toEmail, contact_id: r.contactId });
          }
        }
      }
      return new Response(JSON.stringify({ received: true, processed: 'mkt_verification' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only process mkt-engine emails (support both mkt-engine and mkt_engine tag names)
    if (!tagNames.includes('mkt-engine') && !tagNames.includes('mkt_engine')) {
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

      case 'email.delivery_delayed':
        // Temporary delay — do not mark as failed; Resend will retry
        updates.metadata = { delivery_delayed_at: new Date().toISOString() };
        break;

      case 'email.bounced': {
        const bounceType = (data.bounce_type as string || '').toLowerCase();
        const isHard = bounceType === 'hard' || bounceType === '' || bounceType === 'unknown';
        updates.status = 'bounced';
        updates.failed_at = new Date().toISOString();
        updates.failure_reason = `Bounced (${bounceType || 'unknown'})`;

        if (isHard) {
          await suppressContact(supabase, action, 'hard_bounce', logger);
        } else {
          // Soft bounce — increment counter; escalate at threshold
          await handleSoftBounce(supabase, action, logger);
        }
        break;
      }

      case 'email.complained':
        updates.status = 'bounced';
        updates.complained_at = new Date().toISOString();
        updates.failure_reason = 'Spam complaint';
        await suppressContact(supabase, action, 'spam_complaint', logger);
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
 * Atomically update engagement score via RPC (prevents race conditions on concurrent events).
 */
async function updateEngagementScore(
  supabase: ReturnType<typeof getSupabaseClient>,
  actionId: string,
  eventType: string,
  scoreDelta: number
): Promise<void> {
  try {
    await supabase.rpc('increment_engagement_score', {
      p_action_id:   actionId,
      p_event_type:  eventType,
      p_score_delta: scoreDelta,
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

// suppressContactByEmail is imported from _shared/emailSuppression.ts

// Thin wrapper: resolves enrollment → contact then delegates to shared hardSuppressContact
async function suppressContact(
  supabase: ReturnType<typeof getSupabaseClient>,
  action: { id: string; enrollment_id: string; org_id: string },
  reason: string,
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  try {
    const { data: enrollment } = await supabase
      .from('mkt_sequence_enrollments').select('lead_id').eq('id', action.enrollment_id).single();
    if (!enrollment?.lead_id) return;
    const { data: contact } = await supabase
      .from('contacts').select('email').eq('id', enrollment.lead_id).single();
    await hardSuppressContact(supabase, enrollment.lead_id, action.org_id, contact?.email ?? null, reason);
    await logger.info('contact-suppressed', { lead_id: enrollment.lead_id, reason });
  } catch (err) {
    console.error('[mkt-email-webhook] suppressContact failed:', err);
  }
}

// Thin wrapper: resolves enrollment → contact then delegates to shared softBounceContact
async function handleSoftBounce(
  supabase: ReturnType<typeof getSupabaseClient>,
  action: { id: string; enrollment_id: string; org_id: string },
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  try {
    const { data: enrollment } = await supabase
      .from('mkt_sequence_enrollments').select('lead_id').eq('id', action.enrollment_id).single();
    if (!enrollment?.lead_id) return;
    const { data: contact } = await supabase
      .from('contacts').select('email').eq('id', enrollment.lead_id).single();
    await softBounceContact(supabase, enrollment.lead_id, action.org_id, contact?.email ?? null);
    await logger.info('soft-bounce-handled', { lead_id: enrollment.lead_id });
  } catch (err) {
    console.error('[mkt-email-webhook] handleSoftBounce failed:', err);
  }
}

/**
 * Extract action_id from tracking pixel ID (format: mkt_{uuid}_{timestamp}).
 */
function extractActionId(trackingId: string): string | null {
  if (!trackingId.startsWith('mkt_')) return null;
  const match = trackingId.match(
    /^mkt_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_\d+$/
  );
  return match?.[1] ?? null;
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
