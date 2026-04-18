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

    // Fetch unverified contacts:
    // - Never verified (email_verification_status IS NULL)
    // - OR dns_ok contacts not retried in DNS_OK_RETRY_DAYS
    const retryBefore = new Date(Date.now() - DNS_OK_RETRY_DAYS * 86400 * 1000).toISOString();

    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, email')
      .not('email', 'is', null)
      .neq('email', '')
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
    const SMTP_CONCURRENCY = 5; // parallel SMTP probes — keep groups fast (some SMTP servers take 30-45s)

    async function processContact(contact: { id: string; email: unknown }): Promise<void> {
      try {
        const email = (contact.email as string).trim();
        const domain = email.split('@')[1]?.toLowerCase() || '';

        if (!domain || !email.includes('@')) {
          results['skipped'] = (results['skipped'] || 0) + 1;
          processed++;
          return;
        }

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
            body: JSON.stringify({ email }),
            signal: AbortSignal.timeout(45000),
          });

          if (!res.ok) throw new Error(`Verifier HTTP ${res.status}`);

          const data = await res.json();
          const status: string = data.status || 'unknown';
          const reason: string = data.reason || '';

          // G-Suite and M365 block SMTP probing entirely. We cannot confirm individual
          // mailboxes without sending real emails — which harms sender reputation.
          // Treat them as 'hosted' (same as consumer domains): send cautiously, rely
          // on Resend bounce events to suppress bad addresses after the fact.
          const isWorkspaceHost = status === 'hosted' &&
            (reason === 'google_workspace' || reason === 'microsoft_365');

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
          } else if (isWorkspaceHost) {
            // Mark as hosted — cannot probe without harming reputation.
            await supabase
              .from('contacts')
              .update({
                email_verification_status: 'hosted',
                email_verification_provider: `${reason}`,
                email_verified_at: new Date().toISOString(),
              })
              .eq('id', contact.id);
            results['hosted'] = (results['hosted'] || 0) + 1;
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
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[mkt-email-verifier] Failed for ${contact.id}:`, msg);
        results['error'] = (results['error'] || 0) + 1;
        results[`last_error`] = msg.slice(0, 200);
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

    // Self-chain if the batch was full (contacts.length == limit), regardless of
    // how many succeeded. Using contacts.length avoids the chain dying when errors
    // prevent processed from reaching limit.
    if (contacts.length >= limit) {
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
