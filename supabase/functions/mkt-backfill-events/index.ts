import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { jsonResponse, errorResponse, handleCors } from '../_shared/responseHelpers.ts';
import { getWhatsAppSettings } from '../_shared/exotelWhatsApp.ts';

// One-shot backfill for events that were silently dropped while the
// external webhooks (mkt-whatsapp-webhook, mkt-email-webhook) were 401-ing
// because they had no verify_jwt=false entry in supabase/config.toml.
//
// Sources:
//   1. Exotel V2 messages API — per-SID GET to recover delivery/read status
//      for sent WhatsApp messages where delivered_at IS NULL
//   2. Exotel V2 messages list — pull inbound (direction='incoming') messages
//      and stamp replied_at on the lead's most recent active WA action
//   3. Resend /emails/{id} — recover delivery/open state for sent emails
//
// Limits: third-party retention is finite (Exotel ~24-72h depending on plan,
// Resend ~30d). Anything older is unrecoverable.
//
// Idempotent: every UPDATE guards on the column being NULL.

interface BackfillBody {
  since_hours?: number;          // default 168 (7 days)
  channels?: Array<'whatsapp' | 'email'>; // default both
  org_id?: string;               // optional scoping
  max_per_channel?: number;      // safety cap, default 200 (fits in 150s timeout)
}

const CONCURRENCY = 20;

async function runInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(worker));
  }
}

interface BackfillSummary {
  since:    string;
  whatsapp: { dlr_synced: number; replies_synced: number; checked: number; errors: number };
  email:    { events_synced: number; checked: number; errors: number };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const logger = createEngineLogger('mkt-backfill-events');

  try {
    const body: BackfillBody = await req.json().catch(() => ({} as BackfillBody));
    const sinceHours    = body.since_hours    ?? 168;
    const channels      = body.channels       ?? ['whatsapp', 'email'];
    const maxPerChannel = body.max_per_channel ?? 200;
    const orgFilter     = body.org_id;

    const since = new Date(Date.now() - sinceHours * 3600_000);
    const supabase = getSupabaseClient();

    const summary: BackfillSummary = {
      since: since.toISOString(),
      whatsapp: { dlr_synced: 0, replies_synced: 0, checked: 0, errors: 0 },
      email:    { events_synced: 0, checked: 0, errors: 0 },
    };

    await logger.info('backfill-start', { since: summary.since, channels, max_per_channel: maxPerChannel });

    if (channels.includes('whatsapp')) {
      await backfillWhatsAppDLRs(supabase, since, orgFilter, maxPerChannel, summary, logger);
      await backfillWhatsAppReplies(supabase, since, orgFilter, maxPerChannel, summary, logger);
    }

    if (channels.includes('email')) {
      await backfillEmailEvents(supabase, since, orgFilter, maxPerChannel, summary, logger);
    }

    await logger.info('backfill-complete', summary);
    return jsonResponse({ success: true, ...summary });
  } catch (e) {
    await logger.error('backfill-failed', e);
    return errorResponse(e);
  }
});

// ─── WhatsApp DLR backfill ────────────────────────────────────────────────────
// For every sent WA action with no delivered_at, GET its status from Exotel
// and stamp delivered_at / opened_at if Exotel says it was delivered/read.

async function backfillWhatsAppDLRs(
  supabase: ReturnType<typeof getSupabaseClient>,
  since: Date,
  orgFilter: string | undefined,
  maxRows: number,
  summary: BackfillSummary,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<void> {
  let q = supabase
    .from('mkt_sequence_actions')
    .select('id, external_id, org_id, status, delivered_at')
    .eq('channel', 'whatsapp')
    .not('external_id', 'is', null)
    .is('delivered_at', null)
    .in('status', ['sent', 'pending'])
    .gte('sent_at', since.toISOString())
    .order('sent_at', { ascending: false })
    .limit(maxRows);
  if (orgFilter) q = q.eq('org_id', orgFilter);

  const { data: actions } = await q;
  if (!actions || actions.length === 0) return;

  // Group by org so we fetch Exotel settings once per org.
  const byOrg = new Map<string, typeof actions>();
  for (const a of actions) {
    const arr = byOrg.get(a.org_id as string) ?? [];
    arr.push(a);
    byOrg.set(a.org_id as string, arr);
  }

  for (const [orgId, orgActions] of byOrg) {
    const settings = await getWhatsAppSettings(supabase, orgId);
    if (!settings) {
      summary.whatsapp.errors += orgActions.length;
      continue;
    }
    const basicAuth = btoa(`${settings.api_key}:${settings.api_token}`);

    await runInBatches(orgActions, CONCURRENCY, async (action) => {
      summary.whatsapp.checked++;
      try {
        const url = `https://${settings.subdomain}/v2/accounts/${settings.account_sid}/messages/${action.external_id}`;
        const res = await fetch(url, { headers: { Authorization: `Basic ${basicAuth}` } });
        if (!res.ok) { summary.whatsapp.errors++; return; }

        const json = await res.json();
        // Exotel response shape: { response: { whatsapp: { messages: [{ data: { sid, status, ... } }] } } }
        // Falls back to top-level fields if shape differs across plans.
        const msg     = json?.response?.whatsapp?.messages?.[0]?.data
                     ?? json?.response?.data
                     ?? json?.data
                     ?? json;
        const status  = String(msg?.status ?? '').toLowerCase();

        const updates: Record<string, unknown> = {};
        if (status === 'delivered' || status === 'read') {
          updates.status       = 'delivered';
          updates.delivered_at = new Date().toISOString();
        }
        if (status === 'read') {
          updates.opened_at = new Date().toISOString();
        }
        if (status === 'failed' || status === 'undeliverable') {
          updates.status         = 'failed';
          updates.failed_at      = new Date().toISOString();
          updates.failure_reason = (msg?.errors as Array<{ title: string }>)?.[0]?.title || 'Delivery failed';
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from('mkt_sequence_actions').update(updates).eq('id', action.id as string);
          summary.whatsapp.dlr_synced++;
        }
      } catch {
        summary.whatsapp.errors++;
      }
    });
    await logger.info('wa-dlr-batch', { org_id: orgId, processed: orgActions.length });
  }
}

// ─── WhatsApp inbound replies backfill ────────────────────────────────────────
// Pull inbound messages from Exotel for the time window and stamp replied_at
// on the lead's most recent active WA action.

async function backfillWhatsAppReplies(
  supabase: ReturnType<typeof getSupabaseClient>,
  since: Date,
  orgFilter: string | undefined,
  _maxRows: number,
  summary: BackfillSummary,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<void> {
  // Iterate orgs that had WA traffic in the window.
  let orgQ = supabase
    .from('mkt_sequence_actions')
    .select('org_id')
    .eq('channel', 'whatsapp')
    .gte('sent_at', since.toISOString());
  if (orgFilter) orgQ = orgQ.eq('org_id', orgFilter);

  const { data: orgRows } = await orgQ;
  const orgIds = [...new Set((orgRows ?? []).map((r) => r.org_id as string))];

  for (const orgId of orgIds) {
    const settings = await getWhatsAppSettings(supabase, orgId);
    if (!settings) continue;
    const basicAuth = btoa(`${settings.api_key}:${settings.api_token}`);

    try {
      // Exotel V2 message list — direction filter naming varies; we filter
      // client-side so the call works regardless of param naming.
      const url = `https://${settings.subdomain}/v2/accounts/${settings.account_sid}/messages?from=${encodeURIComponent(since.toISOString())}&limit=200`;
      const res = await fetch(url, { headers: { Authorization: `Basic ${basicAuth}` } });
      if (!res.ok) continue;

      const json = await res.json();
      const list: Array<Record<string, unknown>> =
        json?.response?.whatsapp?.messages
        ?? json?.response?.messages
        ?? json?.messages
        ?? [];

      // Pre-filter to inbound only, then process in parallel batches.
      const inbound = list.filter((m) => {
        const direction = String((m.direction as string) ?? (m.message_type as string) ?? '').toLowerCase();
        return direction.includes('in') || direction === 'received' || direction === 'received_message';
      });

      await runInBatches(inbound, CONCURRENCY, async (m) => {
        const fromRaw = (m.from as string) ?? ((m.contact as Record<string, string>)?.phone) ?? '';
        if (!fromRaw) return;

        const e164Phone = fromRaw.startsWith('+') ? fromRaw : `+${fromRaw.replace(/[^\d]/g, '')}`;

        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('org_id', orgId)
          .eq('phone', e164Phone)
          .limit(1)
          .maybeSingle();
        if (!contact) return;

        const { data: enrollment } = await supabase
          .from('mkt_sequence_enrollments')
          .select('id')
          .eq('lead_id', contact.id as string)
          .eq('status', 'active')
          .order('enrolled_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!enrollment) return;

        const { data: latestAction } = await supabase
          .from('mkt_sequence_actions')
          .select('id, replied_at')
          .eq('enrollment_id', enrollment.id as string)
          .eq('channel', 'whatsapp')
          .in('status', ['sent', 'delivered'])
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!latestAction || latestAction.replied_at) return;

        await supabase
          .from('mkt_sequence_actions')
          .update({ replied_at: new Date().toISOString() })
          .eq('id', latestAction.id as string);
        summary.whatsapp.replies_synced++;
      });
    } catch (e) {
      summary.whatsapp.errors++;
      await logger.warn('wa-replies-org-failed', { org_id: orgId, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

// ─── Resend email events backfill ─────────────────────────────────────────────
// For every sent email action with no delivered_at, GET it from Resend and
// stamp delivered_at / opened_at based on `last_event`.
// Resend's /emails/{id} returns: { id, last_event, opens, clicks, ... }

async function backfillEmailEvents(
  supabase: ReturnType<typeof getSupabaseClient>,
  since: Date,
  orgFilter: string | undefined,
  maxRows: number,
  summary: BackfillSummary,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<void> {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    await logger.warn('resend-key-missing', {});
    return;
  }

  let q = supabase
    .from('mkt_sequence_actions')
    .select('id, external_id, status, delivered_at, opened_at')
    .eq('channel', 'email')
    .not('external_id', 'is', null)
    .or('delivered_at.is.null,opened_at.is.null')
    .in('status', ['sent', 'pending', 'delivered'])
    .gte('sent_at', since.toISOString())
    .order('sent_at', { ascending: false })
    .limit(maxRows);
  if (orgFilter) q = q.eq('org_id', orgFilter);

  const { data: actions } = await q;
  if (!actions || actions.length === 0) return;

  await runInBatches(actions, CONCURRENCY, async (action) => {
    summary.email.checked++;
    try {
      const res = await fetch(`https://api.resend.com/emails/${action.external_id}`, {
        headers: { Authorization: `Bearer ${resendKey}` },
      });
      if (!res.ok) { summary.email.errors++; return; }

      const data = await res.json();
      const lastEvent = String(data?.last_event ?? '').toLowerCase();

      const updates: Record<string, unknown> = {};
      const now = new Date().toISOString();

      // Resend lifecycle: queued → sent → delivered → opened (clicked tracked separately)
      if (!action.delivered_at && (lastEvent === 'delivered' || lastEvent === 'opened' || lastEvent === 'clicked')) {
        updates.status       = 'delivered';
        updates.delivered_at = now;
      }
      if (!action.opened_at && (lastEvent === 'opened' || lastEvent === 'clicked')) {
        updates.opened_at = now;
      }

      // We do NOT set clicked_at — per existing webhook policy, real clicks
      // come from GA4 only (Resend's email.clicked fires on bot link scans).

      if (Object.keys(updates).length > 0) {
        await supabase.from('mkt_sequence_actions').update(updates).eq('id', action.id as string);
        summary.email.events_synced++;
      }
    } catch {
      summary.email.errors++;
    }
  });
}
