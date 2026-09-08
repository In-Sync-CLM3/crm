// Health Sentinel — daily fleet-wide pre-flight check.
//
// Runs every morning (before the workday) and ACTIVELY probes every Supabase
// project in the org, then emails one failure-led green/red checklist per
// project to the ops address. The guiding principle: you cannot catch a system
// that has gone silent from its error logs — you must assert the heartbeat and
// alarm on its ABSENCE. Each check below maps to a real silent-failure class
// we have actually been burned by.
//
// Auth: invoked by the crm cron-worker (Bearer = crm legacy service_role JWT),
// so it runs as a normal verify_jwt=true function.
//
// Secrets it needs on the crm project:
//   MGMT_TOKEN         — org-wide Supabase Management API access token (sbp_...)
//   MGMT_TOKEN_ECHO    — Management API token for the echocommunicator@gmail.com
//                        account (vendorverification, ticket).
//   MGMT_TOKEN_FMAMIT  — token for the fmamit@gmail.com free-tier account
//                        (org "In-Sync-Free-Personal"). Covers BOTH smbconnect
//                        AND expense — they share this one project-scoped-to-org
//                        token. Missing this secret was why smbconnect silently
//                        vanished from the digest entirely (not even "parked" —
//                        discovery just never saw it) and expense stayed
//                        stuck reporting "Parked" for a month after it went live
//                        again on a new ref under this same account (2026-08-24 fix).
//   MGMT_TOKEN_WORKSYNC — token scoped to just the work-sync project (its own
//                        org). Same class of gap as above — work-sync was
//                        re-provisioned live 2026-08-14 but Sentinel kept
//                        reporting it "Parked" because no token could see it.
//                        Supabase Management API auth is per-ACCOUNT, not
//                        per-org — a project on a different account is 100%
//                        invisible to MGMT_TOKEN no matter what org/permissions
//                        it has. Add another SECONDARY_TOKENS entry + secret the
//                        next time a project moves to yet another account
//                        (optional secret — Sentinel runs fine without it, just
//                        blind to that account, which is exactly the failure
//                        mode this comment exists to prevent recurring).
//   RESEND_API_KEY  — for sending the report email
// Everything else (per-project refs, keys, config) is discovered at runtime via
// the Management API, so coverage stays comprehensive as projects come and go.

const MGMT = "https://api.supabase.com";
const OPS_EMAIL = "a@in-sync.co.in";
const FROM = "In-Sync Health Sentinel <notifications@in-sync.co.in>";

// Per-project metadata. Projects not listed here still get the generic checks
// (a brand-new project is covered automatically); listed flags add specialised
// checks. Keep this in sync with the org as products are added.
//   web: the live URL real visitors hit. Drives the frontend render probe.
//        undefined → flagged amber as "not monitored" (so a coverage gap is
//        never silent — this is the lesson from the fieldsync blank-screen
//        outage). Set web:null to intentionally opt a backend-only project out.
//   feedCheck: probe feed query visibility (catches silent feed filter failures)
const META: Record<string, { name: string; dialer?: boolean; marketing?: boolean; bdOutreach?: boolean; jobMatch?: boolean; demoConfirm?: boolean; feedCheck?: boolean; web?: string | null }> = {
  mlvgqudcwlkolsbighnn: { name: "crm (core)", marketing: true, bdOutreach: true, jobMatch: true, web: "https://crm.in-sync.co.in" },
  ejzjrvazegaxrhqizgaa: { name: "globalcrm", dialer: true, demoConfirm: true, web: "https://globalcrm.in-sync.co.in" },
  gwfofzqrfpwojejjodgz: { name: "event", web: "https://event.in-sync.co.in" },
  htdwkhtfdifwajdkkpul: { name: "ats", web: "https://ats-6t2.pages.dev" },
  oygyrpjjwtwvrdvxjzbg: { name: "vendorverification", web: "https://vendorverification.in-sync.co.in" },
  sbplwrtlsbhwcvfvuxel: { name: "ticket", web: "https://ci.in-sync.co.in" },
  wdamzbyvsbergvxhefkl: { name: "smbconnect", feedCheck: true, web: "https://smbconnect.in" },
  ufwvyybrctjpwipbveqe: { name: "RMPL", web: "https://rmpl-sync.pages.dev" },
  upnhhrhobvdmpfnldvgb: { name: "website", web: "https://in-sync.co.in" },
  dhbeivfeuewzkdeqkjpa: { name: "work-sync", web: "https://work.in-sync.co.in" },
  ljokqicllbemfjytfhbi: { name: "expense", web: "https://expense.in-sync.co.in" },
  mcwmrzgtrcrpkxhjugkp: { name: "field-sync", web: "https://field.in-sync.co.in" },
  jemtjynhelobhegppsbp: { name: "it-helpdesk", web: "https://helpdesk.in-sync.co.in" },
};

// PARKED products — backend deliberately deleted (2026-07-10, business decision):
// cost of keeping these running wasn't justified while idle. Schemas + a full
// walkthrough/demo were preserved beforehand so each can be re-provisioned on
// demand the moment a client needs it. These refs will NEVER appear in the
// auto-discovered project list again (the project is genuinely gone from
// Supabase), so without this list they'd just silently vanish from coverage —
// exactly the kind of silent gap this Sentinel exists to prevent. Listed here
// so the digest says "parked on purpose" instead of staying quiet about it.
// The marketing/demo pages at `web` are intentionally still live and still
// take real visitor traffic even though the backend is gone — do NOT flag
// that as a frontend outage; it's not covered by the render probe.
// Remove an entry once its project is re-provisioned for a client (give it a
// fresh META entry with the NEW ref at that point, refs are not reused).
// work-sync and expense REMOVED from this list 2026-08-24 — both were
// re-provisioned live weeks ago (2026-08-14 / 2026-07-24) but Sentinel had no
// Management API token that could see their new accounts, so they kept
// reporting "Parked (business decision)" long after that stopped being true.
// See MGMT_TOKEN_WORKSYNC / MGMT_TOKEN_FMAMIT above. Real META entries added.
// fieldsync REMOVED 2026-08-28 — re-provisioned live 2026-08-26 on a NEW ref
// (mcwmrzgtrcrpkxhjugkp, real client org "Capital India" w/ DSAs/visits/leads),
// but this array still pointed at the OLD deleted ref, so the new project got
// zero real coverage: it fell through to generic checks under its raw ref as
// a name (not "field-sync"), no frontend probe (no web entry), no module
// checks. Found 2026-08-28 while auditing Sentinel's own coverage after the
// BD-outreach silent-failure incident — same failure CLASS as the 2026-08-24
// work-sync/expense fix below: a re-provisioned project silently invisible
// because the registry pointed at the dead ref. Real META + MODULE_MAP added.
const PARKED: { name: string; ref: string; web: string; parkedOn: string }[] = [
  { name: "wa", ref: "unmdhcjrplwntqjiciiz", web: "https://wa.in-sync.co.in", parkedOn: "2026-07-10" },
  { name: "email", ref: "xpndsoozxjrvcwhauunh", web: "https://email.in-sync.co.in", parkedOn: "2026-07-10" },
];

type Status = "ok" | "fail" | "warn";
interface Check { label: string; status: Status; detail: string }

const primaryToken = () => Deno.env.get("MGMT_TOKEN") ?? "";

// Cross-account tokens, tried during discovery in addition to the primary.
// Keep this list to real, currently-in-use secondary accounts only.
const SECONDARY_TOKENS: { label: string; token: string }[] = [
  { label: "echocommunicator", token: Deno.env.get("MGMT_TOKEN_ECHO") ?? "" },
  { label: "fmamit-free", token: Deno.env.get("MGMT_TOKEN_FMAMIT") ?? "" },
  { label: "worksync", token: Deno.env.get("MGMT_TOKEN_WORKSYNC") ?? "" },
].filter((t) => t.token);

// Populated by discoverProjects(): which token owns each discovered ref, so
// every later Management API call for that ref (sql, mgmtGet) uses the right
// account automatically instead of failing 403/"removed" against the primary.
const REF_TOKEN: Record<string, string> = {};
const tokenFor = (ref: string) => REF_TOKEN[ref] || primaryToken();

async function discoverProjects(): Promise<string[]> {
  const refs: string[] = [];
  for (const tk of [primaryToken(), ...SECONDARY_TOKENS.map((t) => t.token)]) {
    if (!tk) continue;
    try {
      const r = await fetch(`${MGMT}/v1/projects`, { headers: { Authorization: `Bearer ${tk}` } });
      if (r.status !== 200) continue;
      const j = await r.json();
      if (!Array.isArray(j)) continue;
      for (const p of j) {
        if (p.status === "INACTIVE") continue;
        REF_TOKEN[p.id] = tk;
        refs.push(p.id);
      }
    } catch (_) { /* one account's discovery failing must not blind the rest */ }
  }
  return refs;
}

async function mgmtGet(path: string, ref?: string): Promise<{ s: number; j: any }> {
  const r = await fetch(MGMT + path, { headers: { Authorization: `Bearer ${ref ? tokenFor(ref) : primaryToken()}` } });
  let j: any = null;
  try { j = await r.json(); } catch { /* non-json */ }
  return { s: r.status, j };
}

async function sql(ref: string, query: string): Promise<any[]> {
  const r = await fetch(`${MGMT}/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenFor(ref)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(j?.message || `sql failed (${r.status})`);
  return j;
}

// --- generic checks (every project) -----------------------------------------

async function checkDb(ref: string): Promise<Check> {
  try {
    await sql(ref, "select 1 as ok");
    return { label: "Database reachable", status: "ok", detail: "responding" };
  } catch (e) {
    return { label: "Database reachable", status: "fail", detail: String(e) };
  }
}

async function checkRegistration(ref: string): Promise<Check> {
  try {
    const { s, j } = await mgmtGet(`/v1/projects/${ref}/config/auth`, ref);
    if (s !== 200) return { label: "Registration email", status: "warn", detail: `config unreadable (${s})` };
    const onResend = /resend/i.test(j.smtp_host || "");
    const rate = Number(j.rate_limit_email_sent || 0);
    if (onResend && rate > 2) return { label: "Registration email", status: "ok", detail: `Resend, ${rate}/hr` };
    return {
      label: "Registration email",
      status: "fail",
      detail: `signup mail on ${j.smtp_host ? j.smtp_host : "built-in starter"} @ ${rate}/hr — past the ${rate}/hr signup silently fails`,
    };
  } catch (e) {
    return { label: "Registration email", status: "warn", detail: String(e) };
  }
}

async function checkRlsExposure(ref: string): Promise<Check> {
  try {
    const rows = await sql(
      ref,
      "select tablename from pg_tables where schemaname='public' and rowsecurity=false order by tablename",
    );
    if (rows.length === 0) return { label: "Row-level security", status: "ok", detail: "no public tables exposed" };
    const names = rows.map((r) => r.tablename);
    return {
      label: "Row-level security",
      status: "warn",
      detail: `${names.length} public table(s) with RLS off: ${names.slice(0, 8).join(", ")}${names.length > 8 ? "…" : ""}`,
    };
  } catch (e) {
    return { label: "Row-level security", status: "warn", detail: String(e) };
  }
}

// --- specialised checks ------------------------------------------------------

const GC_ORG = "61f7f96d-e80c-4d9b-a765-8eb32bd3c70d"; // In-Sync Demo / WorkSync org

// Single source of truth for "is this org's dialer switched on", shared by
// checkDialer and checkDemoConfirmation so a paused dialer is looked up once
// per run instead of each check re-querying it independently.
async function fetchDialingActive(ref: string): Promise<boolean> {
  try {
    const cfg = await sql(ref, `select dialing_active from organization_settings where org_id='${GC_ORG}'`);
    return cfg[0]?.dialing_active === true;
  } catch {
    return false; // unreadable settings → treat as paused (conservative: no false alarms on a config-read blip)
  }
}

async function checkDialer(ref: string, active: boolean): Promise<Check[]> {
  const out: Check[] = [];
  try {
    // A dialer manually switched off (dialing_active = false) is an INTENTIONAL
    // pause, not a fault. Report it as paused (status "ok" → no incident, no
    // escalation) and skip the downstream liveness checks: zero calls is the
    // EXPECTED outcome while paused, so "dialer is silent" would be a false alarm.
    // Only when the dialer is switched ON do an empty queue or silence count as bugs.
    if (!active) {
      out.push({
        label: "Dialer",
        status: "ok",
        detail: "PAUSED — dialing_active = false (manually switched off; not a fault). Liveness checks resume when it's switched back on.",
      });
      return out;
    }

    out.push({ label: "Dialer switched on", status: "ok", detail: "dialing_active = true" });

    // Ready-to-call leads for each active, owned script (catches an empty queue
    // or a script that lost its owner).
    const cand = await sql(
      ref,
      `select s.name, (select count(*) from get_ai_call_candidates('${GC_ORG}'::uuid, 100000, s.owner_id)) n
       from ai_call_scripts s where s.org_id='${GC_ORG}' and s.is_active=true and s.owner_id is not null`,
    );
    const dry = cand.filter((c) => Number(c.n) === 0).map((c) => c.name);
    const total = cand.reduce((a, c) => a + Number(c.n), 0);
    out.push({
      label: "Leads ready to dial",
      status: dry.length ? "warn" : "ok",
      detail: dry.length ? `${dry.join(", ")} have 0 candidates` : `${total} leads queued across ${cand.length} agent(s)`,
    });

    // Liveness by expected output: a dead dialer (e.g. a 401'd cron) shows up as
    // zero calls. 48h window smooths the Sunday no-call day.
    const calls = await sql(
      ref,
      `select count(*) n from call_logs where org_id='${GC_ORG}' and caller_type='ai' and created_at > now() - interval '48 hours'`,
    );
    const n = Number(calls[0]?.n || 0);
    out.push({
      label: "Dialer actually calling",
      status: n > 0 ? "ok" : "fail",
      detail: n > 0 ? `${n} AI calls in last 48h` : "ZERO AI calls in 48h — dialer is silent",
    });
  } catch (e) {
    out.push({ label: "Dialer health", status: "warn", detail: String(e) });
  }
  return out;
}

// Demo-side confirmation is an ACTION that lives in globalcrm (qualify call →
// confirmation email/WA → reminders), not logic crm owns — but crm still
// verifies it's actually happening. Catches exactly the class of bug found
// 2026-07-14: 4 real demo requests sat unresolved for a month because a failed
// qualify call had no fallback, and nothing noticed. A lead stuck in "Demo
// Requested" for a full day (well past any calling-window delay) means
// SOMETHING in that chain silently broke.
async function checkDemoConfirmation(ref: string, dialingActive: boolean): Promise<Check> {
  try {
    // Same exception as checkDialer: when dialing is intentionally switched off
    // for this org, no qualify call/confirmation was ever going to fire, so a
    // lead sitting in Demo Requested is the EXPECTED outcome, not a fault. Only
    // alert when the dialer is actually on and still failed to follow up.
    if (!dialingActive) {
      return {
        label: "Demo confirmation not stuck",
        status: "ok",
        detail: "dialer PAUSED for this org (dialing_active = false) — stuck Demo Requested leads are expected, not a fault",
      };
    }

    const stuck = await sql(
      ref,
      `select c.first_name, c.last_name, c.created_at
       from contacts c join pipeline_stages ps on ps.id = c.pipeline_stage_id
       where ps.name = 'Demo Requested' and c.org_id = '${GC_ORG}'
         and c.created_at < now() - interval '24 hours'
       order by c.created_at asc limit 10`,
    );
    if (stuck.length === 0) {
      return { label: "Demo confirmation not stuck", status: "ok", detail: "no Demo Requested lead older than 24h" };
    }
    const names = stuck.map((r) => `${r.first_name} ${r.last_name || ''}`.trim()).join(", ");
    return {
      label: "Demo confirmation not stuck",
      status: "fail",
      detail: `${stuck.length} lead(s) stuck in Demo Requested >24h — never got a follow-up call, confirmation, or resolution: ${names}`,
    };
  } catch (e) {
    return { label: "Demo confirmation not stuck", status: "warn", detail: String(e) };
  }
}

async function checkMarketing(ref: string): Promise<Check> {
  // crm marketing engine heartbeat: a 401'd / paused cron suite goes silent.
  try {
    // The B2B outreach/lead-gen engine was intentionally stopped 2026-07-14
    // (dead lead sourcing had it polling for nothing, burning DB compute — see
    // project_crm_marketing_engine_paused memory). Zero active campaigns means
    // silence is EXPECTED, not a fault — report paused, skip the liveness check.
    const active = await sql(ref, "select count(*) n from mkt_campaigns where status='active'");
    if (Number(active[0]?.n || 0) === 0) {
      return { label: "Marketing engine live", status: "ok", detail: "PAUSED — 0 active campaigns (intentionally stopped; not a fault)" };
    }
    const rows = await sql(
      ref,
      "select count(*) n from mkt_sequence_actions where coalesce(sent_at, created_at) > now() - interval '24 hours'",
    );
    const n = Number(rows[0]?.n || 0);
    return {
      label: "Marketing engine live",
      status: n > 0 ? "ok" : "warn",
      detail: n > 0 ? `${n} outreach actions in 24h` : "no outreach actions in 24h",
    };
  } catch (e) {
    return { label: "Marketing engine live", status: "warn", detail: String(e) };
  }
}

// --- generic queue-outcome probe -------------------------------------------
// Every send/parse/analytics pipeline in the fleet (WhatsApp, email, bulk
// campaigns, automation executions, scheduled jobs) is the SAME shape: a
// table row sits in a "not-done-yet" status until a cron worker moves it to
// a terminal one. The bd-schedule outage (2026-08-17 to 08-28, 6 silent
// cron runs, 8 days) was this exact shape and nothing was watching it —
// every existing Sentinel check up to that point asked "is this reachable",
// never "did this specific row of work actually get carried". This probe
// asks the second question generically, once, for any such queue: are there
// rows stuck in a not-done status for longer than the pipeline's own normal
// cadence should ever allow? A non-zero answer means the cron is running
// (or Sentinel's DB check would already be red) but NOT converting queued
// work into results — i.e. exactly the "200 OK, did nothing" failure mode.
// staleAfterHours must be generous vs. the real send cadence (a Tue/Wed/Thu
// campaign needs days, not hours) to avoid crying wolf on legitimately
// scheduled-for-later rows.
interface QueueCfg { label: string; table: string; statusCol: string; timeCol: string; stuckStatuses: string[]; staleAfterHours: number }

async function checkQueueOutcome(ref: string, cfg: QueueCfg): Promise<Check> {
  try {
    const statusList = cfg.stuckStatuses.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
    const rows = await sql(
      ref,
      `select count(*) n, min(${cfg.timeCol}) oldest from ${cfg.table}
       where ${cfg.statusCol} in (${statusList})
       and ${cfg.timeCol} < now() - interval '${cfg.staleAfterHours} hours'`,
    );
    const n = Number(rows[0]?.n || 0);
    if (n === 0) return { label: cfg.label, status: "ok", detail: "no stuck rows" };
    const oldest = rows[0]?.oldest as string | null;
    const ageH = oldest ? Math.round((Date.now() - new Date(oldest).getTime()) / 3600000) : null;
    return {
      label: cfg.label,
      status: "fail",
      detail: `${n} row(s) stuck in ${cfg.stuckStatuses.join("/")} for over ${cfg.staleAfterHours}h${ageH ? ` (oldest ${ageH}h)` : ""} — the cron is reachable but not converting queued work into results.`,
    };
  } catch (e) {
    return { label: cfg.label, status: "warn", detail: `probe failed: ${String(e).slice(0, 150)}` };
  }
}

// Send/parse/analytics queues, mapped project-by-project against each
// table's REAL not-done status vocabulary (verified live, not guessed —
// guessing produced false reds on the module map before; see the
// checkModules lesson above). staleAfterHours is set to the pipeline's own
// cadence x a generous multiple, not a round number, so a legitimately
// scheduled-for-later row (e.g. a Tue/Wed/Thu campaign) never trips this.
// timeCol is deliberately the row's own DUE time (scheduled_at/scheduled_for),
// not created_at — a row queued today for a legitimate future send (e.g. a
// Tue/Wed/Thu campaign, or a Day+4 follow-up) has an old created_at but is
// not stuck. Comparing against created_at was the first version of this
// check shipped in this same PR — a live dry-run immediately false-positived
// on 5 rows queued minutes earlier for 2026-09-01, caught before merge. Using
// the DUE time instead means "flag rows whose own send time has already
// passed by staleAfterHours" — which is what "stuck" actually means.
const QUEUE_CHECKS: Record<string, QueueCfg[]> = {
  mlvgqudcwlkolsbighnn: [ // crm
    { label: "Queue · Email automation executions", table: "email_automation_executions", statusCol: "status", timeCol: "scheduled_for", stuckStatuses: ["pending", "scheduled"], staleAfterHours: 4 },
    { label: "Queue · Email bulk campaigns", table: "email_bulk_campaigns", statusCol: "status", timeCol: "scheduled_at", stuckStatuses: ["scheduled", "sending", "pending"], staleAfterHours: 4 },
    { label: "Queue · WhatsApp bulk campaigns", table: "whatsapp_bulk_campaigns", statusCol: "status", timeCol: "scheduled_at", stuckStatuses: ["scheduled", "processing", "pending"], staleAfterHours: 4 },
    { label: "Queue · WhatsApp messages", table: "whatsapp_messages", statusCol: "status", timeCol: "scheduled_at", stuckStatuses: ["scheduled", "pending"], staleAfterHours: 4 },
    { label: "Queue · Email conversations (scheduled sends)", table: "email_conversations", statusCol: "status", timeCol: "scheduled_at", stuckStatuses: ["scheduled", "pending"], staleAfterHours: 4 },
    // The campaign deliberately keeps a ~7-day queue buffer per tier (top-up
    // maintains ~763 rows/tier against a ~100-130/day send rate — see
    // mkt-follow-topup), so a row sitting queued for 1-2 days is normal, not
    // stuck. 30h false-positived on this exact steady-state depth on 2026-09-05.
    // 216h (9 days) sits just past the ~7.6-day worst-case residency at the
    // slowest planned send rate, so it still catches a genuinely dead cron.
    { label: "Queue · Follow campaign (LinkedIn/Facebook asks)", table: "mkt_follow_campaign", statusCol: "status", timeCol: "created_at", stuckStatuses: ["queued"], staleAfterHours: 216 },
  ],
  ejzjrvazegaxrhqizgaa: [ // globalcrm
    { label: "Queue · Email automation executions", table: "email_automation_executions", statusCol: "status", timeCol: "scheduled_for", stuckStatuses: ["pending", "scheduled"], staleAfterHours: 4 },
    { label: "Queue · Email bulk campaigns", table: "email_bulk_campaigns", statusCol: "status", timeCol: "scheduled_at", stuckStatuses: ["scheduled", "sending", "pending"], staleAfterHours: 4 },
    { label: "Queue · WhatsApp bulk campaigns", table: "whatsapp_bulk_campaigns", statusCol: "status", timeCol: "scheduled_at", stuckStatuses: ["scheduled", "processing", "pending"], staleAfterHours: 4 },
    { label: "Queue · WhatsApp messages", table: "whatsapp_messages", statusCol: "status", timeCol: "scheduled_at", stuckStatuses: ["scheduled", "pending"], staleAfterHours: 4 },
    { label: "Queue · Email conversations (scheduled sends)", table: "email_conversations", statusCol: "status", timeCol: "scheduled_at", stuckStatuses: ["scheduled", "pending"], staleAfterHours: 4 },
  ],
  ufwvyybrctjpwipbveqe: [ // RMPL
    { label: "Queue · Scheduled emails", table: "scheduled_emails", statusCol: "status", timeCol: "scheduled_for", stuckStatuses: ["pending", "scheduled", "processing"], staleAfterHours: 4 },
    // webhook_inbox has no status column (verified live) — it's a
    // null-marks-pending shape (processed_at IS NULL), not the enum shape
    // checkQueueOutcome expects. See checkWebhookInboxStale below instead.
  ],
};

async function checkQueues(ref: string): Promise<Check[]> {
  const cfgs = QUEUE_CHECKS[ref];
  if (!cfgs) return [];
  return Promise.all(cfgs.map((c) => checkQueueOutcome(ref, c)));
}

// RMPL webhook_inbox: null-marks-pending shape, not the enum-status shape
// checkQueueOutcome expects — separate probe rather than forcing the generic
// one to handle two different "not done yet" encodings.
async function checkWebhookInboxStale(ref: string): Promise<Check> {
  try {
    const rows = await sql(
      ref,
      `select count(*) n, min(received_at) oldest from webhook_inbox
       where processed_at is null and received_at < now() - interval '6 hours'`,
    );
    const n = Number(rows[0]?.n || 0);
    if (n === 0) return { label: "Queue · Webhook inbox", status: "ok", detail: "no stuck rows" };
    const oldest = rows[0]?.oldest as string | null;
    const ageH = oldest ? Math.round((Date.now() - new Date(oldest).getTime()) / 3600000) : null;
    return { label: "Queue · Webhook inbox", status: "fail", detail: `${n} unprocessed webhook(s) received over 6h ago${ageH ? ` (oldest ${ageH}h)` : ""}` };
  } catch (e) {
    return { label: "Queue · Webhook inbox", status: "warn", detail: `probe failed: ${String(e).slice(0, 150)}` };
  }
}

async function checkBdOutreach(ref: string): Promise<Check> {
  // Genuinely end-to-end, not per-stage: bd-schedule 200'd while every insert
  // silently failed for 8 days (2026-08-17 to 08-28), then bd-contacts 200'd
  // while every Apollo call 403'd/422'd for the pipeline's whole life so far
  // (endpoint deprecation, found 2026-09-08). Two different tables, two
  // different symptoms — but the SAME underlying failure shape, and the first
  // version of this check only watched the second one's stage in isolation
  // (approved drafts -> queued sends), so it read "ok, nothing waiting" while
  // the pipeline was dead further upstream and nothing ever reached approved.
  // A bespoke checkX for every stage that turns out to be able to swallow its
  // own errors is a losing game — the next one to break silently (research,
  // drafting, tracking, a disqualifier misfire) would need yet another
  // hand-written probe discovered only after the fact.
  //
  // Instead: measure the one thing that actually matters end to end — is a
  // NEW firm reaching its first sent email at all, given that a backlog
  // capable of producing one exists? That answer doesn't care which internal
  // stage is broken. The stage counts below are diagnostic detail attached to
  // the SAME check, not separate gating checks of their own, so an alert
  // already tells you where in the funnel the pile-up is without a new probe
  // having to be invented for it first.
  try {
    const rows = await sql(
      ref,
      `with pool as (
         select f.id from bd_firms f
         where f.org_id = '65e22e43-f23d-4c0a-9d84-2eba65ad0e12'
           and f.grade in ('A','B') and f.state_flag is null
       ),
       contact_status as (
         select p.id as firm_id,
           exists (
             select 1 from bd_contacts c
             where c.firm_id = p.id and c.first_name is not null
               and c.email is not null and c.opted_out is not true
           ) as has_contact
         from pool p
       ),
       draft_status as (
         select p.id as firm_id,
           (select d.status from bd_drafts d where d.firm_id = p.id order by d.created_at desc limit 1) as latest_status
         from pool p
       )
       select
         (select count(*) from pool) as pool_size,
         (select count(*) from contact_status where not has_contact) as no_contact,
         (select count(*) from contact_status cs join draft_status ds on ds.firm_id = cs.firm_id
            where cs.has_contact and ds.latest_status is null) as contact_no_draft,
         (select count(*) from draft_status where latest_status = 'pending') as draft_pending_review,
         (select count(*) from draft_status where latest_status = 'approved') as draft_approved_not_queued,
         (select count(distinct firm_id) from bd_events
            where step = 'email_1' and event_type = 'queued' and occurred_at > now() - interval '9 days') as first_touches_last_9d,
         (select max(occurred_at) from bd_events where step = 'email_1' and event_type = 'queued') as last_first_touch`,
    );
    const r = rows[0] || {};
    const pool = Number(r.pool_size || 0);
    const firstTouches9d = Number(r.first_touches_last_9d || 0);
    const lastFirstTouch = r.last_first_touch as string | null;
    const stageDetail = `pool ${pool} (no contact ${r.no_contact}, has contact no draft ${r.contact_no_draft}, `
      + `pending review ${r.draft_pending_review}, approved not sent ${r.draft_approved_not_queued})`;

    if (pool === 0) return { label: "BD outreach pipeline", status: "ok", detail: "no firm is waiting on the funnel" };
    if (firstTouches9d > 0) {
      return { label: "BD outreach pipeline", status: "ok", detail: `${firstTouches9d} new firm(s) reached a first email in the last 9d — ${stageDetail}` };
    }
    // Cadence is 3x/week (Tue/Wed/Thu) — 9 days is a full send week plus a
    // buffer for weekends, so zero NEW firms reaching a first email in that
    // span, with a non-empty pool, means the funnel has stalled somewhere
    // between "loaded" and "sent" — not just an unlucky week.
    const ageDays = lastFirstTouch ? (Date.now() - new Date(lastFirstTouch).getTime()) / 86400000 : Infinity;
    return {
      label: "BD outreach pipeline",
      status: "fail",
      detail: `0 new firms reached a first email in 9d (last one ${lastFirstTouch ? `${Math.floor(ageDays)}d ago` : "never"}) with ${pool} still in the funnel — ${stageDetail}. The pipeline is not converting new firms end to end; check whichever stage above is piling up.`,
    };
  } catch (e) {
    return { label: "BD outreach pipeline", status: "warn", detail: `probe failed: ${String(e).slice(0, 150)}` };
  }
}

// Amit's personal job-application matching engine has no guaranteed daily
// volume (research over volume — some days evaluate zero JDs, on purpose),
// so this does NOT check "did evaluation happen" the way checkBdOutreach
// checks send volume. It checks the two things that ARE always supposed to
// be true: the end-of-day digest cron actually fired (job_digest_runs gets a
// row every day regardless of activity, including a 'skipped_no_activity'
// row on a quiet day), and no 'error' rows are sitting unnoticed.
async function checkJobMatchEngine(ref: string): Promise<Check> {
  try {
    const rows = await sql(
      ref,
      `select
         (select max(run_date) from job_digest_runs) as last_digest_date,
         (select status from job_digest_runs order by created_at desc limit 1) as last_digest_status,
         (select count(*) from job_applications where status = 'error' and created_at > now() - interval '3 days') as recent_errors`,
    );
    const r = rows[0] || {};
    const lastDigestDate = r.last_digest_date as string | null;
    const errors = Number(r.recent_errors || 0);

    if (!lastDigestDate) return { label: "Job-match digest", status: "ok", detail: "no digest run yet — engine not in use" };

    const ageDays = (Date.now() - new Date(lastDigestDate + 'T12:00:00Z').getTime()) / 86400000;
    if (ageDays > 2) {
      return {
        label: "Job-match digest",
        status: "fail",
        detail: `last digest run was ${Math.floor(ageDays)}d ago (${lastDigestDate}) — the daily cron should fire every day regardless of activity; it has stopped.`,
      };
    }
    if (r.last_digest_status === 'error') {
      return { label: "Job-match digest", status: "warn", detail: `most recent digest run ended in 'error' — check job_digest_runs.error_detail` };
    }
    if (errors > 0) {
      return { label: "Job-match digest", status: "warn", detail: `${errors} job_applications row(s) with status='error' in the last 3 days — a JD evaluation is failing silently otherwise` };
    }
    return { label: "Job-match digest", status: "ok", detail: `last digest ${lastDigestDate}, no unresolved errors` };
  } catch (e) {
    return { label: "Job-match digest", status: "warn", detail: `probe failed: ${String(e).slice(0, 150)}` };
  }
}

async function checkSmbFeed(ref: string): Promise<Check> {
  // smbconnect feed query heartbeat: catches silent failures in feed visibility.
  // Regression test for post_context filter syntax issue where posts stop appearing.
  // Creates a test post, verifies it's returned by the feed query, then cleans up.
  const testPostId = crypto.randomUUID();
  try {
    // posts.user_id is FK'd to a real profile — a hardcoded sentinel UUID
    // (00000000-...-1) 400s with a foreign-key violation on this project's data,
    // which reads as "feed broken" when it's really just the probe's own fixture
    // being wrong. Borrow any real existing profile id instead (read-only pick,
    // no dependency on a specific seeded account existing).
    const owner = await sql(ref, "select id from profiles limit 1");
    if (!owner.length) return { label: "Feed post visibility", status: "warn", detail: "no profiles row to borrow as test-post owner — skipped" };
    const testUserId = owner[0].id;
    // 1. Insert test post with post_context='member' (the default for member feeds)
    const insertRes = await sql(
      ref,
      `insert into posts(id, user_id, content, post_context, likes_count, comments_count, shares_count, reposts_count)
       values('${testPostId}', '${testUserId}', 'HEALTH_SENTINEL_TEST', 'member', 0, 0, 0, 0)`,
    );

    // 2. Query the feed using THE EXACT FILTER from MemberFeed.tsx loadPosts()
    // This is the critical line that was broken by unquoted string literals.
    const feedRes = await sql(
      ref,
      `select id from posts where (post_context is null or post_context='member') order by created_at desc limit 50`,
    );

    // 3. Verify the test post appears in results
    const found = feedRes.some((p: any) => p.id === testPostId);

    // 4. Clean up test post (best-effort; failure here doesn't fail the check)
    try {
      await sql(ref, `delete from posts where id='${testPostId}'`);
    } catch (_) { /* cleanup best-effort */ }

    if (!found) {
      return {
        label: "Feed post visibility",
        status: "fail",
        detail: "Member feed query failed to return test post — post_context filter syntax broken or data layer issue",
      };
    }

    return { label: "Feed post visibility", status: "ok", detail: "feed query returns member posts" };
  } catch (e) {
    // Clean up on error (best-effort)
    try { await sql(ref, `delete from posts where id='${testPostId}'`); } catch (_) { }
    return { label: "Feed post visibility", status: "warn", detail: `probe failed: ${String(e).slice(0, 100)}` };
  }
}

// --- frontend render probe ---------------------------------------------------
// The blind spot that let fieldsync go dark mid-demo: every other check asserts
// the DATABASE/backend heartbeat, but a blank-screen SPA has a perfectly healthy
// backend — it dies in the browser because the build shipped with blank VITE_*
// env (createClient throws → white screen for every visitor). The server still
// returns 200 with a valid HTML shell, so a dumb HTTP check sees "up". We catch
// it by asserting the project's Supabase ref is actually BAKED INTO the shipped
// JS bundle — its absence is the exact signature of that build-env-stripping.
//
// A real-browser User-Agent is mandatory: the Cloudflare managed-challenge 403s
// any non-"Mozilla" UA, so a bare fetch sees the challenge page, not the app.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function fetchT(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: { "User-Agent": BROWSER_UA, ...(init?.headers || {}) },
      redirect: "follow",
    });
  } finally { clearTimeout(t); }
}

async function checkFrontend(ref: string, web: string): Promise<Check> {
  const L = "Frontend render";
  try {
    const r = await fetchT(web, 15000, { headers: { Accept: "text/html" } });
    const html = await r.text();
    if (r.status !== 200) {
      // Still challenged even with a browser UA, or genuinely down. A challenge
      // page only affects bots, not real visitors — flag it amber, not red.
      const challenged = /just a moment|cf-browser-verification|challenge-platform|cf-chl/i.test(html);
      return challenged
        ? { label: L, status: "warn", detail: `${web} → HTTP ${r.status} (Cloudflare challenge; real visitors unaffected)` }
        : { label: L, status: "fail", detail: `${web} → HTTP ${r.status} — site not serving` };
    }

    // Find the app's OWN entry bundle (same-origin /assets/*.js), ignoring
    // third-party scripts (Razorpay, help-widget, analytics, service worker).
    const origin = new URL(web).origin;
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
    const own = srcs
      .map((s) => { try { return new URL(s, web).href; } catch { return ""; } })
      .filter((u) => u && new URL(u).origin === origin)
      .filter((u) => !/registerSW|help-widget|sw\.js$/i.test(u));
    const bundles = own.filter((u) => /\/assets\//.test(u)).length ? own.filter((u) => /\/assets\//.test(u)) : own;

    if (bundles.length === 0) {
      return { label: L, status: "fail", detail: `${web} served an HTML shell with no app bundle — blank screen for all users` };
    }

    // The ref (https://<ref>.supabase.co) is baked in only if VITE_SUPABASE_URL
    // was present at build time. Scan the bundles for it.
    let baked = false;
    for (const b of bundles.slice(0, 6)) {
      const jr = await fetchT(b, 20000);
      if (jr.status !== 200) continue;
      const js = await jr.text();
      if (js.includes(ref)) { baked = true; break; }
    }
    return baked
      ? { label: L, status: "ok", detail: `renders; DB config baked into bundle` }
      : {
        label: L,
        status: "fail",
        detail: `${web} shipped WITHOUT its database config (VITE_ env stripped at build) — blank screen for every visitor`,
      };
  } catch (e) {
    return { label: L, status: "warn", detail: `probe failed: ${String(e).slice(0, 120)}` };
  }
}

// --- module-wise checks ------------------------------------------------------
// Each app's user-facing modules mapped to the REAL data layer that backs them,
// so a broken migration / dropped column / dead view shows up as that specific
// module going red (instead of a vague "project up"). Probes are read-only.
//   table/view: assert it exists and the listed key columns are present
//   rpc: actually execute it (read-only) and assert it doesn't error
type ModSpec =
  | { m: string; table: string; cols?: string[] }
  | { m: string; view: string; cols?: string[] }
  | { m: string; rpc: string };
// Helper for existence-only module lists (no column assertions): [label, table][].
const tbl = (pairs: [string, string][]): ModSpec[] => pairs.map(([m, table]) => ({ m, table }));
const MODULE_MAP: Record<string, ModSpec[]> = {
  ejzjrvazegaxrhqizgaa: [ // globalcrm
    { m: "Dashboard", rpc: `get_dashboard_stats('${GC_ORG}'::uuid)` },
    { m: "Contacts", table: "contacts", cols: ["first_name", "email", "phone", "status", "pipeline_stage_id"] },
    { m: "Pipeline (disposition view)", view: "contact_latest_disposition" },
    { m: "Pipeline stages", table: "pipeline_stages", cols: ["name", "stage_order", "probability", "is_active"] },
    { m: "Clients", table: "clients", cols: ["first_name", "last_name", "email", "phone", "company"] },
    { m: "Calling", table: "call_logs", cols: ["agent_id", "status", "conversation_duration", "disposition_id"] },
    { m: "Call dispositions", table: "call_dispositions", cols: ["name", "category", "is_active"] },
    { m: "Templates (WhatsApp)", table: "communication_templates", cols: ["template_name", "template_type", "status"] },
    { m: "Templates (Email)", table: "email_templates", cols: ["is_active"] },
    { m: "Chat / Messages", table: "chat_conversations", cols: ["name", "conversation_type"] },
    { m: "Attendance", table: "attendance_records", cols: ["user_id", "date", "status", "sign_in_time"] },
    { m: "Leave", table: "leave_applications", cols: ["user_id", "leave_type", "start_date", "status", "total_days"] },
    { m: "Leave balances", table: "leave_balances" },
    { m: "HR approvals", table: "attendance_regularizations", cols: ["user_id", "status"] },
    { m: "Users", table: "user_roles", cols: ["role", "is_active", "org_id"] },
    { m: "Teams", table: "teams", cols: ["name", "manager_id"] },
    { m: "Designations", table: "designations", cols: ["name", "role", "is_active"] },
    { m: "Approval matrix", table: "approval_rules", cols: ["approval_type_id"] },
    { m: "Custom fields", table: "custom_fields", cols: ["field_name", "field_type", "field_order"] },
    { m: "Forms", table: "forms", cols: ["name", "is_active", "connector_type"] },
    { m: "Outbound webhooks", table: "outbound_webhooks", cols: ["name", "trigger_event", "webhook_url", "is_active"] },
    { m: "Calendar", table: "contact_activities", cols: ["activity_type", "scheduled_at"] },
    { m: "Billing", table: "organization_subscriptions", cols: ["subscription_status", "wallet_balance", "next_billing_date"] },
    { m: "Reports", rpc: `get_pipeline_performance_report('${GC_ORG}'::uuid)` },
  ],
  // The other products are NOT sales CRMs — each has its own modules. Maps below
  // are built from each project's REAL table inventory (existence-probed; exact
  // names, so no false reds — a red here means a table genuinely vanished).
  // (work-sync + fieldsync module maps removed 2026-07-10 — both PARKED, see
  // the PARKED registry above; recover from git history if re-provisioned.)
  gwfofzqrfpwojejjodgz: tbl([ // event (event mgmt)
    ["Events", "events"], ["Sessions", "sessions"], ["Session speakers", "session_speakers"], ["Speakers", "speakers"],
    ["Registrations", "registrations"], ["Attendee schedules", "attendee_schedules"], ["Check-ins", "check_ins"],
    ["Invitations", "invitations"], ["Badges", "badges"], ["Badge awards", "badge_awards"], ["Certificates", "certificates"],
    ["Certificate templates", "certificate_templates"], ["Rewards", "rewards"], ["Reward claims", "reward_claims"],
    ["Meeting bookings", "meeting_bookings"], ["Meeting requests", "meeting_requests"], ["Meeting slots", "meeting_slots"],
    ["Sponsors", "sponsors"], ["Content library", "content_library"], ["Landing pages", "landing_pages"],
    ["Engagement scores", "engagement_scores"], ["Billing accounts", "billing_accounts"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  // (expense module map removed 2026-07-10 — PARKED, see the PARKED registry above.)
  oygyrpjjwtwvrdvxjzbg: tbl([ // vendorverification (vendor empanelment)
    ["Vendors", "vendors"], ["Vendor documents", "vendor_documents"], ["Verifications", "vendor_verifications"],
    ["Vendor users", "vendor_users"], ["Vendor invitations", "vendor_invitations"], ["Categories", "vendor_categories"],
    ["Category documents", "category_documents"], ["Document types", "document_types"], ["Document analyses", "document_analyses"],
    ["Consent records", "consent_records"], ["Data requests", "data_requests"], ["Fraud alerts", "fraud_alerts"],
    ["Breach notifications", "breach_notifications"], ["Coupons", "coupons"], ["Subscriptions", "org_subscriptions"],
    ["Billing", "billing_transactions"], ["WhatsApp", "whatsapp_messages"], ["WhatsApp templates", "whatsapp_templates"],
    ["Webhooks", "webhook_endpoints"], ["Workflows", "workflow_assignments"], ["Tenants", "tenants"],
    ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  wdamzbyvsbergvxhefkl: tbl([ // smbconnect
    ["Companies", "companies"], ["Members", "members"], ["Associations", "associations"],
    ["Association managers", "association_managers"], ["Connections", "connections"], ["Posts", "posts"],
    ["Post comments", "post_comments"], ["Events", "events"], ["Event registrations", "event_registrations"],
    ["Event coupons", "event_coupons"], ["Email campaigns", "email_campaigns"], ["Email lists", "email_lists"],
    ["Email templates", "email_templates"], ["Email conversations", "email_conversations"], ["WhatsApp", "whatsapp_messages"],
    ["WhatsApp lists", "whatsapp_lists"], ["WhatsApp templates", "whatsapp_templates"], ["Chats", "chats"],
    ["Messages", "messages"], ["Member invitations", "member_invitations"], ["Certifications", "certifications"],
    ["Skills", "skills"], ["Key functionaries", "key_functionaries"], ["Analytics events", "analytics_events"],
    ["Admin users", "admin_users"], ["Company admins", "company_admins"], ["Users", "profiles"],
  ]),
  htdwkhtfdifwajdkkpul: tbl([ // ats (applicant tracking)
    ["Candidates", "candidates"], ["Candidate resumes", "candidate_resumes"], ["Jobs", "jobs"], ["Mandates", "mandates"],
    ["Mandate candidates", "mandate_candidates"], ["Clients", "clients"], ["Pipeline stages", "pipeline_stages"],
    ["Call logs", "call_logs"], ["Call dispositions", "call_dispositions"], ["Sites", "sites"],
    ["Site coordinators", "site_coordinators"], ["Site headcount", "site_headcount_agreements"], ["General tasks", "general_tasks"],
    ["Public applications", "public_job_applications"], ["Email templates", "email_templates"], ["SMS templates", "sms_templates"],
    ["WhatsApp templates", "whatsapp_templates"], ["Teams", "teams"], ["Designations", "designations"],
    ["Webhook connectors", "webhook_connectors"], ["Bulk import", "bulk_import_history"], ["Project teams", "project_team_members"],
    ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  upnhhrhobvdmpfnldvgb: tbl([ // website (core marketing site)
    ["Blogs", "blogs"], ["Contacts", "contacts"], ["Demo requests", "demo_requests"], ["Events", "events"],
    ["Tickets", "tickets"], ["Support tickets", "support_tickets"], ["Tutorials", "tutorials"], ["Whitepapers", "whitepapers"],
    ["Onboarding applications", "onboarding_applications"], ["Unanswered queries", "unanswered_queries"],
    ["Chat logs", "chat_logs"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  dhbeivfeuewzkdeqkjpa: tbl([ // work-sync (hierarchical task accountability) — added 2026-08-24
    ["Tasks", "tasks"], ["Task departments", "task_departments"], ["Task subcategories", "task_subcategories"],
    ["Task comments", "task_comments"], ["Task attachments", "task_attachments"], ["Task milestones", "task_milestones"],
    ["Task watchers", "task_watchers"], ["Projects", "projects"], ["Reporting hierarchy", "reporting_hierarchy"],
    ["Designations", "designations"], ["Feature permissions", "feature_permissions"],
    ["Designation feature access", "designation_feature_access"], ["Support tickets", "support_tickets"],
    ["Payments", "payments"], ["Notifications", "notifications"], ["Teams", "teams"], ["Team members", "team_members"],
    ["Organizations", "organizations"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  ljokqicllbemfjytfhbi: tbl([ // expense (travel expense claims) — added 2026-08-24
    ["Travel claims", "travel_expense_claims"], ["Travel claim items", "travel_expense_items"],
    ["Project claims", "project_expense_claims"], ["Project claim items", "project_expense_claim_items"],
    ["Project travel logs", "project_expense_travel_logs"], ["Advances", "expense_advances"],
    ["Advance requests", "expense_advance_requests"], ["Org memberships", "org_memberships"],
    ["Teams", "teams"], ["Team members", "team_members"], ["API keys", "api_keys"],
    ["Organizations", "organizations"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
  mcwmrzgtrcrpkxhjugkp: tbl([ // field-sync (DSA/agent field visits) — added 2026-08-28
    ["Customers / leads", "customers"], ["Leads", "leads"], ["Lead activities", "lead_activities"],
    ["Visits", "visits"], ["Visit photos", "visit_photos"], ["Visit checklist templates", "visit_checklist_templates"],
    ["Beats", "beats"], ["Beat customers", "beat_customers"], ["Daily plans", "daily_plans"],
    ["Plan visits", "plan_visits"], ["Plan enrollments", "plan_enrollments"], ["Route deviations", "route_deviations"],
    ["Orders", "orders"], ["Order collections", "order_collections"], ["Collections", "collections"],
    ["Invoices", "invoices"], ["Field invoices", "field_invoices"], ["Payment transactions", "payment_transactions"],
    ["Products", "products"], ["Subscription plans", "subscription_plans"], ["Attendance", "attendance"],
    ["Agent locations", "agent_locations"], ["Location history", "location_history"],
    ["Travel reimbursements", "travel_reimbursements"], ["DSAs", "dsas"], ["Sub-DSAs", "sub_dsas"],
    ["Branches", "branches"], ["Dispositions", "dispositions"], ["Sub-dispositions", "sub_dispositions"],
    ["Channel activity alerts", "channel_activity_alerts"], ["Consent records", "consent_records"],
    ["Data requests", "data_requests"], ["Breach notifications", "breach_notifications"],
    ["Organizations", "organizations"], ["Users", "profiles"], ["Roles", "user_roles"],
  ]),
};

// Canonical module catalog for the sibling CRM apps that don't have a hand-built
// MODULE_MAP. Each module lists candidate relation names (to absorb name drift
// across apps) and/or candidate RPC names. At runtime we probe ONLY the modules
// whose table/view/function actually exists in that project — so it auto-fits
// every app and never cries wolf about a module an app simply doesn't have.
type CanonMod = { m: string; rels?: string[]; rpcs?: string[] };
const CANONICAL: CanonMod[] = [
  { m: "Dashboard", rpcs: ["get_dashboard_stats"] },
  { m: "Contacts / Leads", rels: ["contacts", "leads"] },
  { m: "Pipeline stages", rels: ["pipeline_stages", "stages"] },
  { m: "Pipeline (disposition view)", rels: ["contact_latest_disposition"] },
  { m: "Clients", rels: ["clients"] },
  { m: "Calling", rels: ["call_logs", "calls"] },
  { m: "Call dispositions", rels: ["call_dispositions", "dispositions"] },
  { m: "WhatsApp", rels: ["whatsapp_messages", "whatsapp_logs"] },
  { m: "Email", rels: ["email_conversations", "emails", "email_logs"] },
  { m: "Chat", rels: ["chat_conversations", "conversations"] },
  { m: "Templates", rels: ["communication_templates", "whatsapp_templates", "email_templates", "templates"] },
  { m: "Notes", rels: ["notes", "contact_notes"] },
  { m: "Tasks / Activities", rels: ["contact_activities", "activities", "tasks"] },
  { m: "Calendar / Meetings", rels: ["meetings", "calendar_events", "company_holidays"] },
  { m: "Attendance", rels: ["attendance_records", "attendance"] },
  { m: "Leave", rels: ["leave_applications", "leave_requests", "leaves"] },
  { m: "HR approvals", rels: ["attendance_regularizations", "hr_approvals", "approvals"] },
  { m: "Users", rels: ["profiles"] },
  { m: "Roles", rels: ["user_roles"] },
  { m: "Teams", rels: ["teams"] },
  { m: "Designations", rels: ["designations"] },
  { m: "Custom fields", rels: ["custom_fields"] },
  { m: "Forms", rels: ["forms"] },
  { m: "Outbound webhooks", rels: ["outbound_webhooks", "webhooks"] },
  { m: "Billing / Subscriptions", rels: ["organization_subscriptions", "subscriptions"] },
];

async function checkCanonicalModules(ref: string): Promise<Check[]> {
  let relRows: any[], fnRows: any[];
  try {
    relRows = await sql(
      ref,
      "select table_name, table_type from information_schema.tables where table_schema='public'",
    );
    fnRows = await sql(ref, "select distinct proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'");
  } catch (e) {
    return [{ label: "Modules", status: "warn", detail: `schema read failed: ${e}` }];
  }
  const relType: Record<string, string> = {};
  for (const r of relRows) relType[r.table_name] = r.table_type; // 'BASE TABLE' | 'VIEW'
  const fns = new Set(fnRows.map((r) => r.proname));

  const out: Check[] = [];
  for (const c of CANONICAL) {
    const rel = (c.rels || []).find((r) => r in relType);
    const fn = (c.rpcs || []).find((f) => fns.has(f));
    if (!rel && !fn) continue; // module not present in this app — skip, don't flag
    if (rel && relType[rel] === "VIEW") {
      // Views can exist in the catalog but break at runtime — actually select.
      try {
        await sql(ref, `select 1 from "${rel}" limit 1`);
        out.push({ label: `Module · ${c.m}`, status: "ok", detail: `${rel} (view) ok` });
      } catch (e) {
        out.push({ label: `Module · ${c.m}`, status: "fail", detail: `view "${rel}" broken: ${String(e).slice(0, 100)}` });
      }
    } else {
      out.push({ label: `Module · ${c.m}`, status: "ok", detail: rel ? `${rel} present` : `rpc ${fn} present` });
    }
  }
  return out;
}

async function checkModules(ref: string): Promise<Check[]> {
  const specs = MODULE_MAP[ref];
  if (!specs) return await checkCanonicalModules(ref); // sibling apps: self-adapting catalog
  const out: Check[] = [];

  // One round-trip: pull every relevant table/view column from the catalog.
  const rels = [...new Set(specs.flatMap((s) => ("table" in s ? [s.table] : "view" in s ? [s.view] : [])))];
  const present: Record<string, Set<string>> = {};
  if (rels.length) {
    try {
      const rows = await sql(
        ref,
        `select table_name, column_name from information_schema.columns where table_schema='public' and table_name in (${rels.map((r) => `'${r}'`).join(",")})`,
      );
      for (const r of rows) (present[r.table_name] ??= new Set()).add(r.column_name);
    } catch (e) {
      return [{ label: "Modules", status: "warn", detail: `catalog read failed: ${e}` }];
    }
  }

  for (const s of specs) {
    if ("rpc" in s) {
      try {
        await sql(ref, `select ${s.rpc}`);
        out.push({ label: `Module · ${s.m}`, status: "ok", detail: "function executes" });
      } catch (e) {
        out.push({ label: `Module · ${s.m}`, status: "fail", detail: `RPC broken: ${String(e).slice(0, 120)}` });
      }
      continue;
    }
    const rel = "table" in s ? s.table : s.view;
    const cols = present[rel];
    if (!cols || cols.size === 0) {
      out.push({ label: `Module · ${s.m}`, status: "fail", detail: `${"view" in s ? "view" : "table"} "${rel}" missing` });
      continue;
    }
    const missing = (s.cols || []).filter((c) => !cols.has(c));
    out.push(
      missing.length
        ? { label: `Module · ${s.m}`, status: "fail", detail: `"${rel}" missing column(s): ${missing.join(", ")}` }
        : { label: `Module · ${s.m}`, status: "ok", detail: `${rel} ok` },
    );
  }
  return out;
}

async function runProject(ref: string): Promise<{ ref: string; name: string; checks: Check[] }> {
  const m = META[ref] ?? { name: ref };
  const checks: Check[] = [];
  checks.push(await checkDb(ref));
  // The frontend probe is independent of DB health — a blank-screen SPA HAS a
  // healthy DB — so it always runs. undefined web = coverage gap, flag it amber
  // (never silent); null = intentional backend-only opt-out.
  if (m.web) checks.push(await checkFrontend(ref, m.web));
  else if (m.web === undefined) {
    checks.push({ label: "Frontend render", status: "warn", detail: "not monitored — add a web URL to Sentinel META (frontend blind spot)" });
  }
  // Skip the heavy DB checks if the DB itself is down.
  if (checks[0].status !== "fail") {
    checks.push(await checkRegistration(ref));
    checks.push(await checkRlsExposure(ref));
    if (m.dialer || m.demoConfirm) {
      const dialingActive = await fetchDialingActive(ref);
      if (m.dialer) checks.push(...(await checkDialer(ref, dialingActive)));
      if (m.demoConfirm) checks.push(await checkDemoConfirmation(ref, dialingActive));
    }
    if (m.marketing) checks.push(await checkMarketing(ref));
    if (m.bdOutreach) checks.push(await checkBdOutreach(ref));
    if (m.jobMatch) checks.push(await checkJobMatchEngine(ref));
    if (m.feedCheck) checks.push(await checkSmbFeed(ref));
    checks.push(...(await checkQueues(ref)));
    if (ref === "ufwvyybrctjpwipbveqe") checks.push(await checkWebhookInboxStale(ref));
    checks.push(...(await checkModules(ref)));
  }
  return { ref, name: m.name, checks };
}

// --- report ------------------------------------------------------------------

function dot(s: Status) { return s === "ok" ? "🟢" : s === "warn" ? "🟡" : "🔴"; }

function buildEmail(results: { ref: string; name: string; checks: Check[] }[], istDate: string) {
  const reds = results.flatMap((r) => r.checks.filter((c) => c.status === "fail").map((c) => ({ p: r.name, c })));
  const ambers = results.flatMap((r) => r.checks.filter((c) => c.status === "warn").map((c) => ({ p: r.name, c })));
  const allGreen = reds.length === 0 && ambers.length === 0;
  const subject = reds.length
    ? `🔴 Health Sentinel — ${reds.length} issue(s) need attention (${istDate})`
    : ambers.length
    ? `🟡 Health Sentinel — ${ambers.length} thing(s) to watch (${istDate})`
    : `🟢 Health Sentinel — all clear (${istDate})`;

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#111">`;
  html += `<h2 style="margin:0 0 4px">${subject}</h2>`;
  html += `<p style="color:#666;margin:0 0 16px">Daily fleet pre-flight across ${results.length} projects.</p>`;

  if (reds.length) {
    html += `<h3 style="color:#b91c1c">🔴 Broken — fix today</h3><ul>`;
    for (const { p, c } of reds) html += `<li><b>${esc(p)}</b> — ${esc(c.label)}: ${esc(c.detail)}</li>`;
    html += `</ul>`;
  }
  if (ambers.length) {
    html += `<h3 style="color:#b45309">🟡 Watch</h3><ul>`;
    for (const { p, c } of ambers) html += `<li><b>${esc(p)}</b> — ${esc(c.label)}: ${esc(c.detail)}</li>`;
    html += `</ul>`;
  }
  if (allGreen) html += `<p style="color:#15803d;font-weight:600">✅ Every check passed on every project.</p>`;

  html += `<h3 style="color:#555">📦 Parked (business decision) — not monitored on purpose</h3><ul>`;
  for (const p of PARKED) html += `<li><b>${esc(p.name)}</b> — backend deleted ${esc(p.parkedOn)}, schema + walkthrough preserved, re-provision on demand. Marketing page (${esc(p.web)}) intentionally still live.</li>`;
  html += `</ul>`;

  html += `<h3 style="margin-top:20px">Full checklist</h3><table style="border-collapse:collapse;width:100%">`;
  for (const r of results) {
    html += `<tr><td colspan="2" style="padding:10px 6px 2px;font-weight:700;border-top:1px solid #eee">${esc(r.name)}</td></tr>`;
    for (const c of r.checks) {
      html += `<tr><td style="padding:2px 6px;white-space:nowrap">${dot(c.status)} ${esc(c.label)}</td><td style="padding:2px 6px;color:#555">${esc(c.detail)}</td></tr>`;
    }
  }
  html += `</table></div>`;
  return { subject, html };
}

async function sendEmail(subject: string, html: string) {
  // The Resend account is shared with the crm marketing engine, so a momentary
  // per-second 429 is expected; retry with backoff so the daily report never
  // silently drops (the watchman must not go silent — the whole point).
  const body = JSON.stringify({ from: FROM, to: [OPS_EMAIL], subject, html });
  let last = { s: 0, t: "" };
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body,
    });
    last = { s: r.status, t: await r.text() };
    if (r.status !== 429) break;
    await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
  }
  return last;
}

// =================== CLOSED LOOP: auto-fix + incidents + escalation ==========
const CRM_REF = "mlvgqudcwlkolsbighnn";
const OPS_WA = "+917738919680";
const ACK_BASE = `https://${CRM_REF}.supabase.co/functions/v1/sentinel-ack`;
const qs = (s: any) => "'" + String(s ?? "").replace(/'/g, "''") + "'"; // SQL literal
const ist = (s: string) =>
  new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const mins = (from: string) => Math.max(1, Math.round((Date.now() - new Date(from).getTime()) / 60000));

// Stamp the Sentinel's own pulse so sentinel-tripwire can alarm on its absence.
// Best-effort: a heartbeat write failing must never break the run, but it WILL
// (correctly) let the tripwire fire — silence is exactly what it watches for.
async function heartbeat(kind: "watch" | "digest", detail: Record<string, unknown>) {
  try {
    await sql(CRM_REF, `insert into sentinel_heartbeat(kind,last_ok_at,detail,updated_at) values(${qs(kind)},now(),${qs(JSON.stringify(detail))}::jsonb,now()) on conflict (kind) do update set last_ok_at=now(), detail=excluded.detail, updated_at=now()`);
  } catch (_) { /* tripwire will catch the resulting staleness */ }
}

// AUTO-FIX REGISTRY — keyed by check label. Only SAFE, idempotent restorations
// of a known-good state ("set it right"), never anything that builds/migrates.
const AUTO_FIXERS: Record<string, (ref: string) => Promise<{ fixed: boolean; note: string }>> = {
  "Registration email": async (ref) => {
    const body = {
      smtp_admin_email: "notifications@in-sync.co.in", smtp_host: "smtp.resend.com", smtp_port: "587",
      smtp_user: "resend", smtp_pass: Deno.env.get("RESEND_API_KEY"), smtp_sender_name: "In-Sync",
      smtp_max_frequency: 1, rate_limit_email_sent: 100,
    };
    const r = await fetch(`${MGMT}/v1/projects/${ref}/config/auth`, {
      method: "PATCH", headers: { Authorization: `Bearer ${tokenFor(ref)}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { fixed: r.status === 200, note: r.status === 200 ? "re-pointed signup email to Resend @100/hr" : `patch failed (${r.status})` };
  },
};

// --- escalation channels (email live; WhatsApp + AI call gated until wired) ---
async function notifyWhatsApp(text: string): Promise<string> {
  const tpl = Deno.env.get("HEALTH_WA_TEMPLATE");
  if (!tpl) return "wa skipped (no approved template yet)";
  // MUST use the WA-flavoured creds (SID without trailing 'm'); the bare EXOTEL_*
  // pair is VOICE and 401s on the WhatsApp API. See exotel-voice-vs-wa-creds.
  const sid = Deno.env.get("EXOTEL_WA_SID"), key = Deno.env.get("EXOTEL_WA_API_KEY"), tok = Deno.env.get("EXOTEL_WA_API_TOKEN");
  const from = Deno.env.get("EXOTEL_SENDER_NUMBER");
  if (!sid || !key || !tok || !from) return "wa skipped (WA creds missing)";
  try {
    const r = await fetch(`https://${key}:${tok}@api.exotel.com/v2/accounts/${sid}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom_data: "sentinel", whatsapp: { messages: [{ from, to: OPS_WA, content: { type: "template", template: { name: tpl, language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: text.slice(0, 600) }] }] } } }] } }),
    });
    return `wa ${r.status}`;
  } catch (e) { return `wa err ${e}`; }
}

// Places a Health Sentinel voice call directly via Exotel's Voicebot Applet,
// into the shared insync-exotel-bridge (the LiveKit-based agent that replaced
// Bolna fleet-wide — see ai-calling/README.md; RMPL was the first project cut
// over). Used both for the escalation call on a still-open, unacknowledged
// incident and for the "it's fixed now" call once one resolves — which
// script gets spoken is decided by sentinel-ai-call-context from the
// incident's own status, not by which call site invokes this.
//
// Correlation: CustomField was tried first as the round-trip carrier for
// ack_token, on the assumption it would reach the Voicebot Applet's start
// event as a custom_parameter — proven live 2026-09-05 that it does NOT:
// Exotel's callback hit gets it, the WebSocket start event doesn't. Exotel's
// own call_sid DOES round-trip (confirmed identical at placement and at the
// Applet's start event), so that's the real correlator: store it against the
// incident right after Exotel returns it, and sentinel-ai-call-context
// matches on it instead.
async function notifyAiCall(_text: string, ackToken: string): Promise<string> {
  const appId = Deno.env.get("CRM_EXOTEL_APP_ID");
  const callerId = Deno.env.get("CRM_EXOTEL_CALLER_ID");
  const key = Deno.env.get("BOLNA_EXOTEL_API_KEY"), tok = Deno.env.get("BOLNA_EXOTEL_API_TOKEN"), sid = Deno.env.get("BOLNA_EXOTEL_ACCOUNT_SID");
  const domain = Deno.env.get("BOLNA_EXOTEL_DOMAIN") || "api.in.exotel.com";
  if (!appId || !callerId || !key || !tok || !sid) return "call skipped (Exotel AI-call App not configured yet)";
  try {
    const auth = btoa(`${key}:${tok}`);
    const params = new URLSearchParams({
      From: OPS_WA,
      CallerId: callerId,
      Url: `http://my.exotel.com/${sid}/exoml/start_voice/${appId}`,
      CustomField: ackToken,
    });
    const r = await fetch(`https://${domain}/v1/Accounts/${sid}/Calls/connect.json`, {
      method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const j = await r.json().catch(() => ({} as any));
    const callSid = j?.Call?.Sid;
    if (callSid) await sql(CRM_REF, `update sentinel_incidents set last_ai_call_sid=${qs(callSid)}, updated_at=now() where ack_token=${qs(ackToken)}`);
    return `call ${r.status}${callSid ? ` sid=${callSid}` : " (no call_sid in response)"}`;
  } catch (e) { return `call err ${e}`; }
}

// Reconcile current check results against stored incidents: auto-fix, open/resolve
// (with outage windows), and escalate open un-fixable incidents until acknowledged.
async function reconcile(results: { ref: string; name: string; checks: Check[] }[]) {
  const open = await sql(CRM_REF, "select id, project, system, first_failed_at, correctable, acknowledged_at, escalation_count, ack_token from sentinel_incidents where status='open'");
  const openByKey = new Map(open.map((r) => [`${r.project}||${r.system}`, r]));

  const autoFixed: { project: string; system: string; detail: string; note: string }[] = [];
  const failing: { project: string; system: string; detail: string; correctable: boolean }[] = [];

  for (const r of results) {
    for (const c of r.checks) {
      if (c.status !== "fail") continue;
      const fixer = AUTO_FIXERS[c.label];
      if (fixer) {
        const res = await fixer(r.ref).catch((e) => ({ fixed: false, note: String(e) }));
        if (res.fixed) { autoFixed.push({ project: r.name, system: c.label, detail: c.detail, note: res.note }); continue; }
        failing.push({ project: r.name, system: c.label, detail: `${c.detail} (auto-fix failed: ${res.note})`, correctable: true });
      } else {
        failing.push({ project: r.name, system: c.label, detail: c.detail, correctable: false });
      }
    }
  }

  const failKeys = new Set(failing.map((f) => `${f.project}||${f.system}`));
  const restored: any[] = [], autoMsgs: any[] = [], openMsgs: any[] = [];

  // Resolve incidents whose system recovered (human fix, or auto-fixed this run).
  for (const [key, row] of openByKey) {
    if (failKeys.has(key)) continue;
    const af = autoFixed.find((a) => `${a.project}||${a.system}` === key);
    await sql(CRM_REF, `update sentinel_incidents set status='resolved', resolved_at=now(), auto_fixed=${af ? "true" : "false"}, fix_note=${qs(af ? af.note : "recovered")}, updated_at=now() where id=${qs(row.id)}`);
    restored.push({ project: row.project, system: row.system, from: row.first_failed_at, auto: !!af, note: af?.note, ackToken: row.ack_token });
  }
  // Open or refresh incidents for things still failing; escalate the un-fixable.
  for (const f of failing) {
    const key = `${f.project}||${f.system}`;
    const ex = openByKey.get(key);
    let inc = ex;
    if (ex) {
      await sql(CRM_REF, `update sentinel_incidents set last_seen_at=now(), detail=${qs(f.detail)}, correctable=${f.correctable}, updated_at=now() where id=${qs(ex.id)}`);
    } else {
      const ins = await sql(CRM_REF, `insert into sentinel_incidents(project,system,detail,correctable) values(${qs(f.project)},${qs(f.system)},${qs(f.detail)},${f.correctable}) returning id, ack_token, first_failed_at, escalation_count, acknowledged_at`);
      inc = { ...ins[0], project: f.project, system: f.system };
    }
    if (!f.correctable && inc && !inc.acknowledged_at) {
      const ackUrl = `${ACK_BASE}?token=${inc.ack_token}`;
      const line = `${f.system} on ${f.project} is DOWN since ${ist(inc.first_failed_at)} IST (${mins(inc.first_failed_at)} min) — ${f.detail}. Needs a fix.`;
      await sendEmail(`🔴 ACTION NEEDED — ${f.system} on ${f.project} down`,
        `<div style="font-family:system-ui,Arial;font-size:15px"><p style="color:#b91c1c;font-weight:700">${line}</p><p><a href="${ackUrl}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">✔ I'm on it — acknowledge</a></p><p style="color:#777;font-size:12px">You'll keep getting these (and an AI call) until you acknowledge or it's restored.</p></div>`);
      await notifyWhatsApp(line + ` Ack: ${ackUrl}`);
      if ((inc.escalation_count ?? 0) >= 1) await notifyAiCall(line + ` Say NOTED to acknowledge.`, inc.ack_token); // escalate to a call from the 2nd cycle
      await sql(CRM_REF, `update sentinel_incidents set escalation_count=escalation_count+1, escalated_email_at=now(), updated_at=now() where id=${qs(inc.id)}`);
      openMsgs.push({ project: f.project, system: f.system, since: inc.first_failed_at, detail: f.detail });
    }
  }
  // Same-run auto-fixes with no prior incident → audit row + "auto-corrected" note.
  for (const a of autoFixed) {
    if (openByKey.has(`${a.project}||${a.system}`)) continue;
    await sql(CRM_REF, `insert into sentinel_incidents(project,system,detail,correctable,auto_fixed,status,resolved_at,fix_note) values(${qs(a.project)},${qs(a.system)},${qs(a.detail)},true,true,'resolved',now(),${qs(a.note)})`);
    autoMsgs.push(a);
  }
  return { restored, autoMsgs, openMsgs };
}

// Snooze gate: while SENTINEL_SNOOZE_UNTIL (ISO) is in the future, the Sentinel
// goes fully quiet — no checks, no digest, no reconcile/auto-fix, no escalation.
// It resumes BY ITSELF the moment that timestamp passes (no redeploy/intervention
// needed). sentinel-tripwire honours the same secret, so silencing the Sentinel
// this way does NOT make the watchman cry "gone dark". Set/clear via the crm
// project secret of the same name.
function snoozedUntil(): string | null {
  const raw = Deno.env.get("SENTINEL_SNOOZE_UNTIL");
  if (!raw) return null;
  const until = Date.parse(raw);
  return !Number.isNaN(until) && Date.now() < until ? raw : null;
}

Deno.serve(async (req) => {
  try {
    const snooze = snoozedUntil();
    if (snooze) {
      return new Response(
        JSON.stringify({ ok: true, snoozed: true, resumes_at: snooze, note: "Health Sentinel is paused — no checks, digest, auto-fix, or escalation until resumes_at." }, null, 2),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    if (!primaryToken()) return new Response(JSON.stringify({ error: "MGMT_TOKEN not set" }), { status: 500 });

    // Discover the live project list across every configured account (so a new
    // project — or one that moved to a different account — is covered
    // automatically). See SECONDARY_TOKENS above.
    const refs = await discoverProjects();
    if (refs.length === 0) {
      return new Response(JSON.stringify({ error: "project discovery failed for every configured account" }), { status: 502 });
    }

    const results = [];
    for (const ref of refs) results.push(await runProject(ref));
    // Stable, friendly ordering.
    results.sort((a, b) => a.name.localeCompare(b.name));

    const istDate = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry") === "1";
    let reqBody: any = {};
    try { reqBody = await req.json(); } catch { /* no body */ }
    const digest = url.searchParams.get("digest") === "1" || reqBody?.digest === true;

    // Closed loop: auto-fix correctable drift, open/resolve incidents with outage
    // windows, escalate the un-fixable until acknowledged. (Read-only on dry run.)
    let loop: any = { restored: [], autoMsgs: [], openMsgs: [] };
    if (!dryRun) {
      loop = await reconcile(results);
      // "Restored" notices — closes the loop for both auto-healed and human-fixed.
      for (const r of loop.restored) {
        const line = `${r.system} on ${r.project} failed ${ist(r.from)} IST → now (${mins(r.from)} min) and is ${r.auto ? "AUTO-corrected" : "restored"}${r.note ? ": " + r.note : ""}.`;
        await sendEmail(`✅ RESTORED — ${r.system} on ${r.project}`, `<p style="font-family:system-ui,Arial;color:#15803d;font-weight:600;font-size:15px">${line}</p>`);
        await notifyWhatsApp(line);
        // Closes the loop by voice too, every time — not just for incidents that
        // had escalated to a call while open (user's explicit call 2026-09-05).
        await notifyAiCall(line, r.ackToken);
      }
      // Same-run auto-corrections (drift caught and put right before it bit you).
      for (const a of loop.autoMsgs) {
        const line = `🔧 ${a.system} on ${a.project} had drifted (${a.detail}) — auto-corrected: ${a.note}.`;
        await sendEmail(`🔧 AUTO-FIXED — ${a.system} on ${a.project}`, `<p style="font-family:system-ui,Arial;color:#1d4ed8;font-size:15px">${line}</p>`);
      }
    }

    // Full per-module digest only on the daily run (hourly runs just reconcile/escalate).
    let emailStatus = "hourly watch (no digest)";
    if (digest && !dryRun) {
      const { subject, html } = buildEmail(results, istDate);
      const e = await sendEmail(subject, html);
      emailStatus = `digest resend ${e.s}`;
      // Self-heartbeat: only stamp when the digest email ACTUALLY sent (2xx), so
      // sentinel-tripwire can alarm if the morning report ever goes missing again.
      if (e.s >= 200 && e.s < 300) {
        const reds = results.reduce((a, r) => a + r.checks.filter((c) => c.status === "fail").length, 0);
        const ambers = results.reduce((a, r) => a + r.checks.filter((c) => c.status === "warn").length, 0);
        await heartbeat("digest", { resend: e.s, projects: results.length, reds, ambers });
      }
    }

    // Watch heartbeat: the function reached end-to-end this run. This is the
    // pulse that goes stale fastest if the whole Sentinel is dead (e.g. a 401'd
    // invoker means we never get here at all), so the tripwire catches it soonest.
    if (!dryRun) await heartbeat("watch", { mode: digest ? "digest" : "watch" });

    const summary = results.map((r) => ({
      project: r.name,
      red: r.checks.filter((c) => c.status === "fail").length,
      amber: r.checks.filter((c) => c.status === "warn").length,
    }));
    const verbose = url.searchParams.get("verbose");
    const body: any = {
      ok: true, mode: digest ? "daily-digest" : dryRun ? "dry" : "hourly-watch", email: emailStatus,
      loop: { auto_fixed: loop.autoMsgs.length, restored: loop.restored.length, escalated_open: loop.openMsgs.length }, summary,
      parked: PARKED.map((p) => ({ project: p.name, note: `PARKED ${p.parkedOn} (business decision) — backend deleted, marketing page still live, re-provision on demand` })),
    };
    if (dryRun || verbose) {
      const want = verbose && verbose !== "1" ? verbose : null;
      body.detail = results
        .filter((r) => !want || r.name.includes(want))
        .map((r) => ({ project: r.name, checks: r.checks.map((c) => `${c.status === "ok" ? "OK" : c.status === "warn" ? "WARN" : "FAIL"} ${c.label}${c.status === "ok" ? "" : " — " + c.detail}`) }));
    }
    return new Response(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
