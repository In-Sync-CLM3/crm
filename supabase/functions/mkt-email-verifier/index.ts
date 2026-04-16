import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VERIFIER_URL = 'http://204.168.237.119:3000';
const BATCH_SIZE = 200;
const DELAY_MS = 100;
// Retry dns_ok contacts every 7 days
const DNS_OK_RETRY_DAYS = 7;
// Promote pending_bounce → valid after 48 h with no bounce signal
const PENDING_BOUNCE_PROMOTE_HOURS = 48;
// Verification sender — set VERIFICATION_FROM_EMAIL env var once domain is ready.
// Format: "Name <email@domain.com>"
const VERIFICATION_FROM_EMAIL = Deno.env.get('VERIFICATION_FROM_EMAIL') || '';

// Consumer / free email providers — mark as 'hosted' immediately, skip SMTP probe.
// These domains are not probeable and have no value in B2B campaigns.
const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.in', 'yahoo.fr', 'yahoo.de',
  'ymail.com', 'rocketmail.com',
  'outlook.com', 'hotmail.com', 'hotmail.co.in', 'hotmail.in', 'live.com',
  'live.in', 'msn.com', 'windowslive.com',
  'rediffmail.com', 'rediff.com',
  'aol.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'pm.me', 'proton.me',
  'mail.com', 'email.com', 'inbox.com',
  'yandex.com', 'yandex.ru',
  'gmx.com', 'gmx.net', 'gmx.de',
  'fastmail.com', 'fastmail.fm',
]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Send a brief, innocuous verification email via Resend.
 * Tagged mkt_verification so the bounce webhook can identify and suppress
 * the contact without linking to a campaign action.
 */
async function sendVerificationEmail(toEmail: string, fromEmail: string): Promise<void> {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) throw new Error('RESEND_API_KEY not set');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: 'Quick introduction',
      html: `<p>Hi,</p>
<p>I came across your profile and wanted to briefly introduce myself. I work with a team focused on helping businesses streamline their client operations and growth.</p>
<p>If you'd ever like to explore how we could be useful, I'd be happy to connect.</p>
<p>Best regards,<br>Arohan Shaw</p>`,
      tags: [{ name: 'mkt_verification', value: '1' }],
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API ${res.status}: ${errText}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getSupabaseClient();

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    // Optional limit override for test runs. Default: BATCH_SIZE.
    const limit: number = typeof body.limit === 'number' ? Math.min(body.limit, BATCH_SIZE) : BATCH_SIZE;
    // Always attempt SMTP probe — port 25 is now open on the Hetzner server.
    const verifyUrl = `${VERIFIER_URL}/verify?smtp=1`;

    // Promote pending_bounce contacts that haven't bounced in 48 h → valid.
    // Runs every invocation (cron every 15 min), so no dedicated cron needed.
    const promoteAfter = new Date(Date.now() - PENDING_BOUNCE_PROMOTE_HOURS * 3600 * 1000).toISOString();
    await supabase
      .from('contacts')
      .update({ email_verification_status: 'valid' })
      .eq('email_verification_status', 'pending_bounce')
      .is('email_bounce_type', null)
      .lt('email_verified_at', promoteAfter);

    // Fetch unverified contacts:
    // - Never verified (email_verification_status IS NULL)
    // - OR dns_ok contacts not retried in DNS_OK_RETRY_DAYS
    const retryBefore = new Date(Date.now() - DNS_OK_RETRY_DAYS * 86400 * 1000).toISOString();

    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, email')
      .not('email', 'is', null)
      .is('email_bounce_type', null)
      .or(`email_verification_status.is.null,and(email_verification_status.eq.dns_ok,email_verified_at.lt.${retryBefore})`)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    if (!contacts || contacts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No emails to verify', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processed = 0;
    const results: Record<string, number> = {};
    const SMTP_CONCURRENCY = 10; // parallel SMTP probes — safe for Hetzner server

    async function processContact(contact: { id: string; email: unknown }): Promise<void> {
      try {
        const domain = (contact.email as string).split('@')[1]?.toLowerCase() || '';

        if (CONSUMER_DOMAINS.has(domain)) {
          // Consumer/free email — mark hosted instantly, no API call
          await supabase
            .from('contacts')
            .update({
              email_verification_status: 'hosted',
              email_verification_provider: 'smtp-self-hosted',
              email_verified_at: new Date().toISOString(),
            })
            .eq('id', contact.id);
          results['hosted'] = (results['hosted'] || 0) + 1;
        } else {
          await sleep(DELAY_MS);
          const res = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: contact.email }),
            signal: AbortSignal.timeout(12000),
          });

          if (!res.ok) throw new Error(`Verifier HTTP ${res.status}`);

          const data = await res.json();
          const status: string = data.status || 'unknown';

          if (status === 'dns_ok') {
            await supabase
              .from('contacts')
              .update({
                email_verification_status: 'dns_ok',
                email_verification_provider: 'smtp-self-hosted',
                email_verified_at: new Date().toISOString(),
              })
              .eq('id', contact.id);
            results['dns_ok'] = (results['dns_ok'] || 0) + 1;
          } else if (status === 'hosted' && VERIFICATION_FROM_EMAIL) {
            await sendVerificationEmail(contact.email as string, VERIFICATION_FROM_EMAIL);
            await supabase
              .from('contacts')
              .update({
                email_verification_status: 'pending_bounce',
                email_verification_provider: 'smtp-self-hosted',
                email_verified_at: new Date().toISOString(),
              })
              .eq('id', contact.id);
            results['pending_bounce'] = (results['pending_bounce'] || 0) + 1;
          } else {
            await supabase
              .from('contacts')
              .update({
                email_verification_status: status,
                email_verification_provider: 'smtp-self-hosted',
                email_verified_at: new Date().toISOString(),
                ...(status === 'invalid' ? {
                  email_bounce_type: 'hard',
                  email_bounced_at: new Date().toISOString(),
                } : {}),
              })
              .eq('id', contact.id);
            results[status] = (results[status] || 0) + 1;
          }
        }
        processed++;
      } catch (err) {
        console.error(`[mkt-email-verifier] Failed for ${contact.id}:`, err);
        results['error'] = (results['error'] || 0) + 1;
      }
    }

    // Process in parallel groups of SMTP_CONCURRENCY
    for (let i = 0; i < contacts.length; i += SMTP_CONCURRENCY) {
      const group = contacts.slice(i, i + SMTP_CONCURRENCY);
      await Promise.allSettled(group.map(processContact));
    }

    const response = new Response(
      JSON.stringify({
        message: 'Verification complete',
        processed,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // Self-chain immediately if we filled the batch — more contacts are likely waiting.
    // The pg_cron heartbeat (every 5 min) restarts the chain if it ever breaks.
    if (processed >= limit) {
      const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mkt-email-verifier`;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }).catch(() => {});
    }

    return response;
  } catch (err) {
    console.error('[mkt-email-verifier] Fatal:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
