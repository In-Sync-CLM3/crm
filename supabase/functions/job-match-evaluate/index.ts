/**
 * job-match-evaluate — the whole job-application matching engine, in one call.
 *
 * Research is the point, not volume (Amit, 2026-09-08): given a JD, this
 * actually visits the company's own site and news before judging fit, the
 * same depth-over-speed principle bd-research uses for BD outreach. It is
 * meant to be called once per JD Claude is actively considering during a
 * job-search session, not run as a bulk crawler.
 *
 * Two hard gates run BEFORE the expensive match call, so cost is spent where
 * it counts: recency (posted over a week ago -> reject) and location (must be
 * worldwide-remote-from-India eligible, or physically Gurgaon FT/Hybrid).
 *
 * The match test itself is the canonical rule in memory
 * (feedback_jd_match_exact_not_adjacent): a "no" is matching basic/adjacent
 * skills but not the JD's actual distinguishing requirement. Runs on Opus —
 * this needs real judgment, not the cheap tier.
 *
 * No step is allowed to fail silently. Every path either produces a real
 * 'evaluated' row or an explicit 'error' row with the failure recorded — an
 * 'error' status is never allowed to read as a quiet 'reject'.
 *
 *   POST {
 *     platform, company, role_title, jd_text, jd_url?, pay_range?,
 *     posted_date?  (ISO date, omit if the platform doesn't expose it),
 *     posted_by?
 *   }
 */
import { AMIT_RESUME_TEXT } from '../_shared/amitResume.ts';
import { callLLMJson } from '../_shared/llmClient.ts';
import { searchWeb, searchNews, pickOwnDomain, fetchPage } from '../_shared/bdSearch.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (s: number, m: string) => new Response(JSON.stringify({ error: m }), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface EvalRequest {
  platform: string;
  company: string;
  role_title: string;
  jd_text: string;
  jd_url?: string;
  pay_range?: string;
  posted_date?: string;
  posted_by?: string;
}

const RECENCY_LIMIT_DAYS = 7;

// Obvious, cheap-to-detect location disqualifiers — checked before spending a
// real company-research pass on something that can't be taken regardless of
// fit. Nuanced cases (e.g. "Remote (US)") still go to Opus, which sees the
// full JD text and the same two allowed buckets.
const HARD_LOCATION_DISQUALIFIERS = [
  /\bUS[\s-]?only\b/i, /\bmust be (?:located|based) in the (?:US|United States|UK|Europe)\b/i,
  /\bon[\s-]?site\b.{0,40}\b(?!Gurgaon|Gurugram)[A-Z][a-z]+,\s*[A-Z]{2}\b/,
  /\brequires? (?:a )?(?:US|UK|EU) work (?:visa|authorization|permit)\b/i,
];

function checkRecency(postedDate: string | undefined): { ok: boolean; note: string } {
  if (!postedDate) return { ok: true, note: 'posting date not available from this platform — proceeding, cannot verify recency' };
  const posted = new Date(postedDate);
  if (isNaN(posted.getTime())) return { ok: true, note: `posted_date "${postedDate}" unparseable — proceeding without recency check` };
  const ageDays = (Date.now() - posted.getTime()) / 86400000;
  if (ageDays > RECENCY_LIMIT_DAYS) return { ok: false, note: `posted ${Math.floor(ageDays)} days ago — over the ${RECENCY_LIMIT_DAYS}-day limit` };
  return { ok: true, note: `posted ${Math.floor(ageDays)} day(s) ago — within limit` };
}

async function researchCompany(company: string): Promise<{ profile: string; hiringTrend: string; sources: string[] }> {
  const sources: string[] = [];
  let combined = '';

  const hits = await searchWeb(company);
  if (hits.length) sources.push(`search:${hits.length}`);
  const domain = pickOwnDomain(company, hits);

  if (domain) {
    const pages = await Promise.all(
      ['', '/about', '/careers', '/jobs'].map((p) => fetchPage(domain.replace(/\/$/, '') + p)),
    );
    let ownPages = 0;
    for (const page of pages) {
      if (!page) continue;
      ownPages++;
      combined += ' ' + page.text.slice(0, 8000);
    }
    if (ownPages) sources.push(`site:${ownPages}`);
  }

  const news = await searchNews(company, 5);
  if (news.length) {
    sources.push(`news:${news.length}`);
    combined += ' RECENT NEWS: ' + news.map((n) => `${n.title} (${n.date})`).join('; ');
  }

  if (!combined.trim()) {
    return { profile: 'No company website or news found — could not verify company profile.', hiringTrend: 'unknown — no source material found', sources };
  }

  const snippets = hits.slice(0, 5).map((h) => `${h.title}: ${h.snippet}`).join(' ');
  return {
    profile: (snippets + ' ' + combined).slice(0, 6000),
    hiringTrend: news.length ? news.map((n) => n.title).join('; ').slice(0, 1000) : 'no recent news found — hiring trend unverifiable from this source set',
    sources,
  };
}

interface MatchJudgment {
  verdict: 'high_match' | 'reject';
  confidence: 'high' | 'medium' | 'low';
  match_reasoning: string;
  matched_requirements: string[];
  missing_requirements: string[];
  work_arrangement: string;
  location_scope: 'worldwide_remote' | 'named_countries' | 'gurgaon' | 'other';
  quoted_compensation: string;
}

const SYSTEM_PROMPT = `You judge whether a job posting is a genuine fit for the candidate below, using ONE rule:

A match is "yes" (high_match) ONLY when the JD's core, distinguishing requirements were done HANDS-ON, as the accountable practitioner — not touched adjacently, not built-as-a-tool-for-someone-else-who-does-it, not merely "same general domain."

For every core/distinguishing line in the JD (ignore generic boilerplate like "proficient in MS Office" or a bare degree requirement), ask: did the candidate actually DO this specific work, as the accountable person, not adjacent to it? If ANY core requirement fails that test, the verdict is reject — even when surface keywords or general domain overlap look strong.

The flip side matters equally: a role where the candidate was the accountable OWNER of a real, equivalent outcome DOES count as an exact match, even without holding that literal job title. The test is "accountable practitioner of the real thing," not "job title matches" or "worked in the same industry."

Default to reject on any ambiguity. Only return high_match when you can name the specific, concrete evidence in the resume that satisfies the JD's actual distinguishing requirement — not a plausible-sounding inference.

Location/work-arrangement rule: the candidate has NO work authorization for the US or Europe and cannot relocate. The ONLY acceptable arrangements are (a) fully remote work explicitly open to India-based candidates (worldwide remote, or remote with no country restriction), or (b) a role physically based in Gurgaon/Gurugram, India, full-time or hybrid. Anything else (on-site outside India, remote restricted to a specific non-India country/region, hybrid outside Gurgaon) is an automatic reject regardless of skill fit — state this plainly in match_reasoning if it's the reason.

Compensation: if the role is Gurgaon-based, quoted_compensation should be "Current CTC INR 20,00,000; Expected INR 28,00,000". If it's a US/Europe remote role, quote 20% below the posting's own stated range midpoint if one exists, else 20% below your best-informed market estimate for that role/seniority — but never below $50/hour. State the number and how it was derived in quoted_compensation.

CANDIDATE RESUME:
${AMIT_RESUME_TEXT}

Return ONLY valid JSON matching this exact shape:
{
  "verdict": "high_match" | "reject",
  "confidence": "high" | "medium" | "low",
  "match_reasoning": "2-4 sentences, plain, specific",
  "matched_requirements": ["short phrase", ...],
  "missing_requirements": ["short phrase", ...],
  "work_arrangement": "remote" | "hybrid" | "onsite" | "unclear",
  "location_scope": "worldwide_remote" | "named_countries" | "gurgaon" | "other",
  "quoted_compensation": "string"
}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = getSupabaseClient();
  let body: EvalRequest;
  try {
    body = await req.json();
  } catch {
    return err(400, 'invalid JSON body');
  }

  if (!body.company || !body.role_title || !body.jd_text || !body.platform) {
    return err(400, 'platform, company, role_title and jd_text are required');
  }

  const base = {
    platform: body.platform,
    company: body.company,
    role_title: body.role_title,
    jd_url: body.jd_url ?? null,
    jd_text: body.jd_text,
    pay_range: body.pay_range ?? null,
    posted_date: body.posted_date ?? null,
    posted_by: body.posted_by ?? null,
  };

  try {
    // ── Gate 1: recency ──────────────────────────────────────────────────
    const recency = checkRecency(body.posted_date);
    if (!recency.ok) {
      const { data, error } = await supabase.from('job_applications').insert({
        ...base,
        verdict: 'reject',
        confidence: 'high',
        match_reasoning: `Rejected before research: ${recency.note}.`,
        status: 'evaluated',
      }).select().single();
      if (error) throw error;
      return ok({ ...data, gate: 'recency' });
    }

    // ── Gate 2: obvious hard location disqualifiers (cheap check) ────────
    const hardDisqualified = HARD_LOCATION_DISQUALIFIERS.some((re) => re.test(body.jd_text) || re.test(body.role_title));
    if (hardDisqualified) {
      const { data, error } = await supabase.from('job_applications').insert({
        ...base,
        verdict: 'reject',
        confidence: 'high',
        match_reasoning: 'Rejected before research: JD text contains an explicit location/authorization restriction outside remote-from-India or Gurgaon.',
        status: 'evaluated',
      }).select().single();
      if (error) throw error;
      return ok({ ...data, gate: 'location' });
    }

    // ── Real research: visit the company, not just the JD text ───────────
    const research = await researchCompany(body.company);

    // ── The actual judgment, on Opus ──────────────────────────────────────
    const prompt = `JOB POSTING
Platform: ${body.platform}
Company: ${body.company}
Role: ${body.role_title}
Pay range as posted: ${body.pay_range || 'not stated'}
Posted: ${recency.note}

JD TEXT:
${body.jd_text}

COMPANY RESEARCH (from the company's own site and recent news, not assumed):
${research.profile}

HIRING-TREND SIGNAL:
${research.hiringTrend}`;

    const { data: judgment } = await callLLMJson<MatchJudgment>(prompt, { model: 'opus', system: SYSTEM_PROMPT, max_tokens: 1200, temperature: 0.1 });

    const { data, error } = await supabase.from('job_applications').insert({
      ...base,
      company_profile_notes: research.profile.slice(0, 4000),
      hiring_trend_notes: research.hiringTrend.slice(0, 1000),
      work_arrangement: judgment.work_arrangement,
      location_scope: judgment.location_scope,
      verdict: judgment.verdict,
      confidence: judgment.confidence,
      match_reasoning: judgment.match_reasoning,
      matched_requirements: judgment.matched_requirements,
      missing_requirements: judgment.missing_requirements,
      quoted_compensation: judgment.quoted_compensation,
      status: 'evaluated',
    }).select().single();
    if (error) throw error;

    return ok({ ...data, research_sources: research.sources });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Never let a failure disappear: an 'error' row is logged even when the
    // rest of the pipeline threw, so the digest and Health Sentinel both see
    // it — the exact failure mode that hid the bd-schedule/bd-contacts bugs.
    try {
      await supabase.from('job_applications').insert({
        ...base,
        status: 'error',
        error_detail: msg.slice(0, 2000),
      });
    } catch (e2) {
      console.error('[job-match-evaluate] FATAL: could not even log the error row:', String(e2));
    }
    console.error('[job-match-evaluate] error:', msg);
    return err(500, msg);
  }
});
