import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VERIFIER_URL = 'http://204.168.237.119:3000';
const BATCH_SIZE = 50;
const DELAY_MS = 100;
// Retry dns_ok contacts every 7 days (will get SMTP probed once port 25 opens)
const DNS_OK_RETRY_DAYS = 7;

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
    // - OR dns_ok contacts not retried in DNS_OK_RETRY_DAYS (awaiting port 25)
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

    for (const contact of contacts) {
      try {
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
          // MX exists, not hosted — SMTP probe pending (port 25 blocked)
          // Just update the timestamp so we retry in DNS_OK_RETRY_DAYS
          await supabase
            .from('contacts')
            .update({
              email_verification_status: 'dns_ok',
              email_verification_provider: 'smtp-self-hosted',
              email_verified_at: new Date().toISOString(),
            })
            .eq('id', contact.id);
        } else {
          await supabase
            .from('contacts')
            .update({
              email_verification_status: status,
              email_verification_provider: 'smtp-self-hosted',
              email_verified_at: new Date().toISOString(),
              // Auto-suppress invalid emails immediately
              ...(status === 'invalid' ? {
                email_bounce_type: 'hard',
                email_bounced_at: new Date().toISOString(),
              } : {}),
            })
            .eq('id', contact.id);
        }

        results[status] = (results[status] || 0) + 1;
        processed++;
      } catch (err) {
        console.error(`[mkt-email-verifier] Failed for ${contact.id}:`, err);
        results['error'] = (results['error'] || 0) + 1;
      }

      await sleep(DELAY_MS);
    }

    return new Response(
      JSON.stringify({
        message: 'Verification complete',
        processed,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[mkt-email-verifier] Fatal:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
