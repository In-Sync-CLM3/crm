/**
 * job-match-digest — end-of-day summary of everything job-match-evaluate
 * looked at today: what was applied, what was rejected and why, and
 * anything that errored. Runs once daily (IST end of day).
 *
 * Every run logs to job_digest_runs regardless of outcome, including a
 * 'skipped_no_activity' row on a quiet day and an 'error' row if the send
 * itself fails — so Health Sentinel can tell "the digest didn't run today"
 * from "there was nothing to report", never confusing the two.
 */
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'notifications@in-sync.co.in';
const DIGEST_TO = 'fmamit@gmail.com';

function istDateString(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600000);
  return ist.toISOString().slice(0, 10);
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = getSupabaseClient();
  const now = new Date();
  const runDate = istDateString(now);
  // Day boundary in IST, expressed back in UTC for the DB query.
  const dayStartUtc = new Date(new Date(runDate + 'T00:00:00+05:30').getTime());
  const dayEndUtc = new Date(dayStartUtc.getTime() + 86400000);

  try {
    const { data: rows, error } = await supabase
      .from('job_applications')
      .select('*')
      .gte('created_at', dayStartUtc.toISOString())
      .lt('created_at', dayEndUtc.toISOString())
      .order('created_at', { ascending: true });
    if (error) throw error;

    const all = rows || [];
    const applied = all.filter((r) => r.status === 'applied');
    const rejected = all.filter((r) => r.status === 'evaluated' && r.verdict === 'reject');
    const highMatchNotYetApplied = all.filter((r) => r.status === 'evaluated' && r.verdict === 'high_match');
    const errored = all.filter((r) => r.status === 'error');

    if (all.length === 0) {
      await supabase.from('job_digest_runs').insert({ run_date: runDate, status: 'skipped_no_activity' });
      return ok({ sent: false, reason: 'no activity today' });
    }

    const section = (title: string, items: typeof all, render: (r: (typeof all)[number]) => string) =>
      items.length
        ? `<h3>${title} (${items.length})</h3><ul>${items.map((r) => `<li>${render(r)}</li>`).join('')}</ul>`
        : '';

    const html = `
      <h2>Job search — ${runDate}</h2>
      ${section('Applied', applied, (r) => `<strong>${escapeHtml(r.role_title)}</strong> at ${escapeHtml(r.company || '?')} (${escapeHtml(r.platform)}) — ${escapeHtml(r.quoted_compensation || r.pay_range || '')}`)}
      ${section('High match, not yet applied', highMatchNotYetApplied, (r) => `<strong>${escapeHtml(r.role_title)}</strong> at ${escapeHtml(r.company || '?')} (${escapeHtml(r.platform)}) — ${escapeHtml(r.match_reasoning || '')}`)}
      ${section('Rejected', rejected, (r) => `<strong>${escapeHtml(r.role_title)}</strong> at ${escapeHtml(r.company || '?')} (${escapeHtml(r.platform)}) — ${escapeHtml(r.match_reasoning || '')}`)}
      ${section('Errors', errored, (r) => `<strong>${escapeHtml(r.role_title)}</strong> at ${escapeHtml(r.company || '?')} (${escapeHtml(r.platform)}) — ${escapeHtml(r.error_detail || 'no detail captured')}`)}
    `;

    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: `Job Search Digest <${RESEND_FROM_EMAIL}>`,
        to: [DIGEST_TO],
        subject: `Job search digest — ${runDate} (${applied.length} applied, ${rejected.length} rejected${errored.length ? `, ${errored.length} errors` : ''})`,
        html,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);

    await supabase.from('job_digest_runs').insert({
      run_date: runDate, status: 'sent',
      evaluated_count: all.length, applied_count: applied.length,
      rejected_count: rejected.length, error_count: errored.length,
    });
    return ok({ sent: true, counts: { applied: applied.length, rejected: rejected.length, errored: errored.length } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await supabase.from('job_digest_runs').insert({ run_date: runDate, status: 'error', error_detail: msg.slice(0, 2000) });
    } catch (e2) {
      console.error('[job-match-digest] FATAL: could not log the error run:', String(e2));
    }
    console.error('[job-match-digest] error:', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
