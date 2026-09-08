/**
 * bd-contacts — find a primary and a fallback contact per firm via Apollo.
 *
 * Title priority is the whole point: HR screens for work authorisation before
 * anyone reads the record, and sales turns him into a prospect. The ranking in
 * _shared/bdPipeline.ts encodes that, and NEVER_CONTACT titles are dropped
 * outright rather than kept as a fallback.
 *
 * A CEO is deliberately not used as the fallback for a CTO — if both decline,
 * the firm is closed. Prefer a second delivery-side title.
 *
 *   POST { limit: 10 }
 */
import { BD_ORG_ID, scoreContact } from '../_shared/bdPipeline.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (s: number, m: string) => new Response(JSON.stringify({ error: m }), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Reveal a real email/last name for one Apollo person id (costs a credit). */
async function revealPerson(apolloKey: string, id: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apolloKey },
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json())?.person ?? null;
  } catch { return null; }
}

const TITLES = [
  'Director of Delivery', 'VP Delivery', 'Head of Delivery', 'Director of Consulting',
  'Practice Lead', 'CTO', 'Chief Architect', 'VP Engineering', 'President', 'COO',
  'Managing Partner', 'Founder', 'CEO',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = getSupabaseClient();
  const apolloKey = Deno.env.get('APOLLO_API_KEY');
  if (!apolloKey) return err(500, 'APOLLO_API_KEY not configured');

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 10, 25);

    // Firms worth enriching: gradeable, not in a manual state, and short of
    // a usable contact.
    const { data: firms } = await supabase
      .from('bd_firms')
      .select('id, firm_name, website, grade, bd_contacts(id, first_name, email, opted_out)')
      .eq('org_id', BD_ORG_ID)
      .is('state_flag', null)
      .in('grade', ['A', 'B'])
      .limit(limit * 4);

    const needing = (firms || []).filter((f) => {
      const cs = ((f as Record<string, any>).bd_contacts || []) as { first_name?: string; email?: string; opted_out?: boolean }[];
      return !cs.some((c) => c.first_name && c.email && !c.opted_out);
    }).slice(0, limit);

    if (!needing.length) return ok({ skip: 'every eligible firm already has a usable contact' });

    const results: Record<string, unknown>[] = [];

    for (const f of needing) {
      const domain = f.website
        ? new URL(f.website).hostname.replace(/^www\./, '')
        : `${String(f.firm_name).toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

      let people: Record<string, any>[] = [];
      try {
        // mixed_people/search is deprecated by Apollo in favour of api_search,
        // which returns names obfuscated and no email — those only come back
        // from a separate people/match "reveal" call below, made just for the
        // 1-2 candidates actually selected, not for every result.
        const res = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apolloKey },
          body: JSON.stringify({
            q_organization_domains: domain,
            person_titles: TITLES,
            page: 1, per_page: 10,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          results.push({ firm: f.firm_name, error: `apollo ${res.status}: ${(await res.text()).slice(0, 120)}` });
          continue;
        }
        people = (await res.json()).people || [];
      } catch (e) {
        results.push({ firm: f.firm_name, error: `apollo call failed: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }

      // Rank by the title priority, dropping anyone on the never-contact list.
      const ranked = people
        .map((p) => ({ p, s: scoreContact(p.title) }))
        .filter((x) => x.s !== null && x.p.first_name)
        .sort((a, b) => a.s!.rank - b.s!.rank);

      if (!ranked.length) {
        await supabase.from('bd_firms').update({
          notes: `contacts: Apollo returned no usable title for ${domain} — park or find one by hand`,
          updated_at: new Date().toISOString(),
        }).eq('id', f.id);
        results.push({ firm: f.firm_name, found: 0 });
        continue;
      }

      // Fallback must not be the CEO behind a CTO: pick the next DIFFERENT
      // rank where possible, so a decline from one doesn't close the firm.
      const primary = ranked[0];
      const fallback = ranked.find((r) => r.s!.rank !== primary.s!.rank && r.s!.rank <= 3) || ranked[1] || null;

      let primaryEmailFound = false;
      for (const [rec, isPrimary] of [[primary, true], [fallback, false]] as [typeof primary | null, boolean][]) {
        if (!rec) continue;
        // api_search never returns email or a real last name — reveal them
        // with a match call scoped to just this one selected candidate.
        const revealed = await revealPerson(apolloKey, rec.p.id);
        const email = revealed?.email && revealed.email_status === 'verified' ? revealed.email : null;
        if (isPrimary) primaryEmailFound = !!email;
        await supabase.from('bd_contacts').upsert({
          org_id: BD_ORG_ID,
          firm_id: f.id,
          is_primary: isPrimary,
          first_name: rec.p.first_name,
          last_name: revealed?.last_name || rec.p.last_name || null,
          title: rec.p.title,
          email,
          linkedin_url: revealed?.linkedin_url || rec.p.linkedin_url || null,
          source: 'apollo',
          why_chosen: rec.s!.why,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'firm_id,is_primary', ignoreDuplicates: false });
      }

      results.push({
        firm: f.firm_name,
        primary: `${primary.p.first_name} ${primary.p.last_name || ''} (${primary.p.title})`.trim(),
        fallback: fallback ? `${fallback.p.first_name} (${fallback.p.title})` : 'none',
        email_found: primaryEmailFound,
      });

      await new Promise((r) => setTimeout(r, 1200));   // stay well inside Apollo's rate limit
    }

    console.log(`[bd-contacts] enriched ${results.length}`);
    return ok({ success: true, processed: results.length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bd-contacts] fatal:', msg);
    return err(500, msg);
  }
});
