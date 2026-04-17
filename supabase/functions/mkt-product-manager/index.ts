import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLMJson } from '../_shared/llmClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardBody {
  mode: 'onboard';
  org_id: string;
  product_name: string;
  product_url: string;
  git_repo_url?: string;
  product_notes?: string;
  supabase_url: string;
  supabase_service_role_key: string;
}

interface FinalizeIcpBody {
  mode: 'finalize_icp';
  org_id: string;
  product_key: string;
}

interface ResumeBody {
  mode: 'resume';
  org_id: string;
  product_key: string;
}

interface ResetStepBody {
  mode: 'reset_step';
  org_id: string;
  product_key: string;
  step_name: string;
}

interface ToggleBody {
  mode: 'toggle';
  product_id: string;
  active: boolean;
}

interface SyncBody {
  mode: 'sync';
  org_id: string;
}

interface DeleteBody {
  mode: 'delete';
  org_id: string;
  product_key: string;
}

interface RefreshContentBody {
  mode: 'refresh_content';
  org_id: string;
  product_key: string;
}

type RequestBody = OnboardBody | ResumeBody | ToggleBody | SyncBody | DeleteBody | RefreshContentBody | FinalizeIcpBody;

interface OnboardingStep {
  id: string;
  product_key: string;
  step_name: string;
  step_order: number;
  status: 'pending' | 'in_progress' | 'complete' | 'skipped' | 'failed';
  attempts: number;
  scheduled_for: string | null;
  completed_at: string | null;
  details: Record<string, unknown> | null;
  error: string | null;
}

interface StepResult {
  step_name: string;
  status: string;
  completed_at: string | null;
  error: string | null;
}

interface StepContext {
  supabase: SupabaseClient;
  logger: ReturnType<typeof createEngineLogger>;
  org_id: string;
  product_key: string;
  product_url: string;
  git_repo_url: string;
  product_notes: string;
  supabase_url: string;
  supabase_service_role_key: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "Vendor Verification" -> "vendor-verification" */
function deriveProductKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** "Vendor Verification" -> "VV" */
function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/** Create a Supabase client for an external product database */
function createProductClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Fetch a URL and return plain-text content (HTML stripped).
 * Strips scripts/styles, collapses whitespace, caps at 6000 chars.
 * Returns empty string on any error — callers treat it as optional context.
 */
async function crawlPageContent(url: string): Promise<string> {
  if (!url) return '';
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Arohan-Revenue-Engine/1.0 (product-onboarding)' },
    });
    if (!resp.ok) return '';
    const html = await resp.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
    return text;
  } catch {
    return '';
  }
}

/**
 * Fetch README.md (and optionally package.json) from a GitHub repo URL.
 * Accepts https://github.com/owner/repo or https://github.com/owner/repo.git
 * Returns empty string if not accessible.
 */
async function crawlGitRepoContent(repoUrl: string): Promise<string> {
  if (!repoUrl) return '';
  try {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.\s?#]+)/);
    if (!match) return '';
    const [, owner, repo] = match;

    const tryFetch = async (branch: string): Promise<string> => {
      const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
      const readmeResp = await fetch(`${base}/README.md`, { signal: AbortSignal.timeout(8_000) });
      if (!readmeResp.ok) return '';
      return (await readmeResp.text()).slice(0, 5000);
    };

    return (await tryFetch('main')) || (await tryFetch('master'));
  } catch {
    return '';
  }
}

/** Read the service role key for a product from env vars */
function getProductServiceKey(productName: string): string | undefined {
  const initials = deriveInitials(productName);
  return Deno.env.get(`${initials}_SUPABASE_SERVICE_KEY`);
}

/** Extract the top N keys from a frequency map, sorted by count descending. */
function topKeysFromFreqMap(freq: Record<string, number>, limit = 7): string[] {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

/**
 * Persist the onboarding-inferred ICP as version 1 in mkt_product_icp.
 * Safe to call on re-runs — uses ON CONFLICT DO NOTHING via ignoreDuplicates.
 */
async function persistICPFromOnboarding(
  supabase: SupabaseClient,
  org_id: string,
  productKey: string,
  icpHints: Record<string, unknown>,
  trialDays: number,
  log: (msg: string) => void,
): Promise<boolean> {
  const industries = icpHints.industries
    ? topKeysFromFreqMap(icpHints.industries as Record<string, number>)
    : [];
  const designations = icpHints.designations
    ? topKeysFromFreqMap(icpHints.designations as Record<string, number>)
    : [];
  const company_sizes: string[] = icpHints.company_sizes
    ? [...new Set((icpHints.company_sizes as unknown[]).map(String))]
    : [];

  const { error } = await supabase.from('mkt_product_icp').upsert(
    {
      org_id,
      product_key: productKey,
      industries,
      designations,
      company_sizes,
      aha_moment_days: trialDays,
      version: 1,
      confidence_score: 0.300,
      evolved_by: 'onboarding',
      evolution_reason: 'Initial ICP inferred from product data during onboarding',
      last_evolved_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,product_key,version', ignoreDuplicates: true },
  );

  if (error) {
    log(`WARNING: Failed to persist ICP: ${error.message}`);
    return false;
  }

  log(`ICP v1 persisted: ${industries.length} industries, ${designations.length} designations, ${company_sizes.length} company sizes`);
  return true;
}

/**
 * Build the base system prompt for a Vapi assistant at onboarding time.
 * Combines the base persona, product context, and call-type script.
 * Memory briefing is injected at call-time by mkt-initiate-call, NOT here.
 */
function buildOnboardSystemPrompt(
  script: Record<string, unknown>,
  productName: string,
  productUrl: string,
): string {
  const keyPoints = (script.key_points as string[]) || [];
  const objections = (script.objection_handling as Record<string, string>) || {};

  let prompt = `You are Arohan, an AI sales assistant. You are professional, warm, and concise.
You represent ${productName} (${productUrl}).

CALL TYPE: ${script.call_type}
CALL OBJECTIVE: ${script.objective || 'Engage the prospect and move toward next steps'}`;

  if (keyPoints.length > 0) {
    prompt += `

KEY TALKING POINTS:
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
  }

  if (Object.keys(objections).length > 0) {
    prompt += `

OBJECTION HANDLING:
${Object.entries(objections).map(([objection, response]) => `- If they say "${objection}": ${response}`).join('\n')}`;
  }

  prompt += `

CLOSING: ${script.closing || 'Thank you for your time.'}

RULES:
- Keep responses under 2-3 sentences. Be conversational, not scripted.
- If they're not interested, be respectful and end the call gracefully.
- If they ask to be removed from the call list, acknowledge and end the call.
- Never be pushy or aggressive. Mirror their tone and pace.
- If they ask who you are, say you are Arohan, an AI assistant calling on behalf of the ${productName} team.
- Always end with a clear next step (demo booking, email follow-up, or callback time).`;

  return prompt;
}

/** Map our category names to the DB's category values */
function mapEmailCategory(cat: string): string {
  const map: Record<string, string> = {
    nurture: 'nurture',
    closing: 'follow_up',
    onboarding: 'nurture',
    cold: 'outreach',
    reactivation: 're_engagement',
  };
  return map[cat] || 'outreach';
}

// ---------------------------------------------------------------------------
// Step runner — mark helpers
// ---------------------------------------------------------------------------

async function markStepInProgress(
  supabase: SupabaseClient,
  stepId: string,
  attempts: number,
): Promise<void> {
  await supabase
    .from('mkt_onboarding_steps')
    .update({
      status: 'in_progress',
      attempts: attempts + 1,
      started_at: new Date().toISOString(),
    })
    .eq('id', stepId);
}

async function markStepComplete(
  supabase: SupabaseClient,
  stepId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from('mkt_onboarding_steps')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      details,
      error: null,
    })
    .eq('id', stepId);
}

async function markStepSkipped(
  supabase: SupabaseClient,
  stepId: string,
  reason: string,
): Promise<void> {
  await supabase
    .from('mkt_onboarding_steps')
    .update({
      status: 'skipped',
      completed_at: new Date().toISOString(),
      details: { reason },
      error: null,
    })
    .eq('id', stepId);
}

async function markStepFailed(
  supabase: SupabaseClient,
  stepId: string,
  errorMessage: string,
): Promise<void> {
  await supabase
    .from('mkt_onboarding_steps')
    .update({
      status: 'failed',
      error: errorMessage,
    })
    .eq('id', stepId);
}

// ---------------------------------------------------------------------------
// Step handlers
// ---------------------------------------------------------------------------

async function stepRegister(ctx: StepContext): Promise<Record<string, unknown>> {
  const { supabase, org_id, product_key, product_url, git_repo_url, product_notes, supabase_url } = ctx;
  const initials = deriveInitials(product_key.replace(/-/g, ' '));
  const secretUrlName = `${initials}_SUPABASE_URL`;
  const secretKeyName = `${initials}_SUPABASE_SERVICE_KEY`;

  // Derive product_name from key (reverse slug)
  const product_name = product_key
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const { data: product, error } = await supabase
    .from('mkt_products')
    .upsert(
      {
        org_id,
        product_key,
        product_name,
        product_url,
        git_repo_url: git_repo_url || null,
        product_notes: product_notes || null,
        supabase_url,
        supabase_secret_name: secretKeyName,
        onboarding_status: 'in_progress',
        active: false,
      },
      { onConflict: 'org_id,product_key' },
    )
    .select('id, product_name')
    .single();

  if (error) throw new Error(`Failed to upsert mkt_products: ${error.message}`);

  // Persist service role key as a Supabase project secret so resume/reset_step
  // can retrieve it without asking the user again.
  if (ctx.supabase_service_role_key) {
    const mgmtToken = Deno.env.get('SB_MGMT_TOKEN') ?? '';
    const projectRef = (Deno.env.get('SUPABASE_URL') ?? '')
      .replace('https://', '').replace('.supabase.co', '');
    if (mgmtToken && projectRef) {
      await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${mgmtToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { name: secretKeyName, value: ctx.supabase_service_role_key },
          { name: secretUrlName, value: supabase_url },
        ]),
      }).catch((e) => console.warn('[register] Failed to store product secret:', e));
    }
  }

  return {
    product_id: product.id,
    product_name: product.product_name,
    secret_url_name: secretUrlName,
    secret_key_name: secretKeyName,
  };
}

async function stepSchemaSniff(ctx: StepContext): Promise<Record<string, unknown>> {
  const { supabase, org_id, product_key, supabase_url, supabase_service_role_key } = ctx;

  // Skip if no product Supabase credentials were provided
  if (!supabase_url || !supabase_service_role_key) {
    await supabase
      .from('mkt_products')
      .update({ schema_map: {}, trial_days: 14 })
      .eq('org_id', org_id)
      .eq('product_key', product_key);
    return { skipped: true, reason: 'No product Supabase credentials provided', schema_map: {} };
  }

  const productClient = createProductClient(supabase_url, supabase_service_role_key);
  const schemaMap: Record<string, string> = {};

  // Step 1: enumerate all public tables via information_schema (service role can always read this)
  let allTables: string[] = [];
  try {
    const { data: rows } = await (productClient as any)
      .schema('information_schema')
      .from('tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');
    allTables = ((rows as Array<{ table_name: string }>) || []).map((r) => r.table_name.toLowerCase());
  } catch { /* fall through to probe */ }

  // Broad keyword lists for role categorisation — first match wins
  const REGISTRATION_NAMES = ['users', 'user', 'profiles', 'profile', 'registrations', 'accounts', 'customers', 'employees', 'employee', 'workers', 'worker', 'members', 'member', 'staff', 'agents', 'agent', 'contacts', 'contact', 'vendors', 'vendor', 'suppliers', 'supplier', 'partners', 'partner', 'clients', 'client', 'technicians', 'technician', 'field_agents', 'field_workers'];
  const PAYMENT_NAMES      = ['payments', 'payment', 'subscriptions', 'subscription', 'orders', 'order', 'invoices', 'invoice', 'billing', 'transactions', 'transaction', 'charges', 'charge'];
  const PRICING_NAMES      = ['plans', 'plan', 'pricing', 'price', 'products', 'tiers', 'tier', 'packages', 'package'];
  const EVENT_NAMES        = ['events', 'event', 'activities', 'activity', 'activity_log', 'audit_log', 'usage', 'logs', 'log', 'tasks', 'task', 'assignments', 'assignment', 'attendance', 'shifts', 'shift', 'sessions', 'session', 'verifications', 'verification', 'checks', 'check', 'inspections', 'inspection', 'site_visits', 'visits', 'visit', 'work_orders', 'tickets', 'ticket', 'jobs', 'job'];

  if (allTables.length > 0) {
    const find = (keywords: string[]) => allTables.find((t) => keywords.includes(t));
    const r = find(REGISTRATION_NAMES);
    const p = find(PAYMENT_NAMES);
    const pr = find(PRICING_NAMES);
    const e = find(EVENT_NAMES);
    if (r)  schemaMap.registrations_table = r;
    if (p)  schemaMap.payments_table      = p;
    if (pr) schemaMap.pricing_table       = pr;
    if (e)  schemaMap.events_table        = e;
  } else {
    // Fallback: blind probe using all known names across all categories
    const allProbeNames = [...new Set([...REGISTRATION_NAMES, ...PAYMENT_NAMES, ...PRICING_NAMES, ...EVENT_NAMES])];
    const probeResults: string[] = [];
    await Promise.all(allProbeNames.map(async (tableName) => {
      const { error } = await productClient.from(tableName).select('id').limit(1);
      if (!error) probeResults.push(tableName);
    }));
    allTables = probeResults; // use discovered tables for all_tables below

    const find = (keywords: string[]) => probeResults.find((t) => keywords.includes(t));
    const r = find(REGISTRATION_NAMES);
    const p = find(PAYMENT_NAMES);
    const pr = find(PRICING_NAMES);
    const e = find(EVENT_NAMES);
    if (r)  schemaMap.registrations_table = r;
    if (p)  schemaMap.payments_table      = p;
    if (pr) schemaMap.pricing_table       = pr;
    if (e)  schemaMap.events_table        = e;
  }

  // Always store the full table list so Arohan sees every table, not just the 4 role buckets
  (schemaMap as Record<string, unknown>).all_tables = allTables;

  const trialDays = schemaMap.events_table ? 21 : 14;
  await supabase
    .from('mkt_products')
    .update({ schema_map: schemaMap, trial_days: trialDays })
    .eq('org_id', org_id)
    .eq('product_key', product_key);

  return { schema_map: schemaMap, trial_days: trialDays, tables_found: Object.keys(schemaMap).length };
}

async function stepIcpInfer(ctx: StepContext): Promise<Record<string, unknown>> {
  const { supabase, org_id, product_key, product_url, git_repo_url, product_notes, supabase_url, supabase_service_role_key } = ctx;

  const { data: product } = await supabase
    .from('mkt_products')
    .select('product_name, schema_map, trial_days')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .single();

  const product_name = product?.product_name ?? product_key;
  const schemaMap = (product?.schema_map || {}) as Record<string, string>;
  const trialDays = (product?.trial_days as number) ?? 14;

  // ── Step 1: Crawl landing page + git repo (primary signal) ───────────────
  const [pageText, repoText] = await Promise.all([
    crawlPageContent(product_url),
    crawlGitRepoContent(git_repo_url),
  ]);

  const crawledContext = [
    pageText ? `=== Landing Page (${product_url}) ===\n${pageText}` : '',
    repoText ? `=== Repository README ===\n${repoText}` : '',
  ].filter(Boolean).join('\n\n');

  // ── Step 2: Optionally enrich with real DB user data ─────────────────────
  let dbEnrichment = '';
  if (schemaMap.registrations_table && supabase_url && supabase_service_role_key) {
    try {
      const productClient = createProductClient(supabase_url, supabase_service_role_key);
      const { data: sampleUsers } = await productClient
        .from(schemaMap.registrations_table)
        .select('*')
        .limit(50);

      if (sampleUsers && sampleUsers.length > 0) {
        const fields = Object.keys(sampleUsers[0]);
        const industryField = fields.find((f) => /industry|sector|vertical/i.test(f));
        const sizeField = fields.find((f) => /size|employees|company_size/i.test(f));
        const designationField = fields.find((f) => /designation|role|title|position/i.test(f));

        const dbSummary: string[] = [`DB sample: ${sampleUsers.length} real users`];
        if (industryField) {
          const freq: Record<string, number> = {};
          sampleUsers.map((u: Record<string, unknown>) => u[industryField]).filter(Boolean)
            .forEach((i: unknown) => { const k = String(i); freq[k] = (freq[k] || 0) + 1; });
          dbSummary.push(`Industries: ${Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v})`).join(', ')}`);
        }
        if (sizeField) {
          const sizes = [...new Set(sampleUsers.map((u: Record<string, unknown>) => u[sizeField]).filter(Boolean).map(String))].slice(0, 5);
          dbSummary.push(`Company sizes: ${sizes.join(', ')}`);
        }
        if (designationField) {
          const freq: Record<string, number> = {};
          sampleUsers.map((u: Record<string, unknown>) => u[designationField]).filter(Boolean)
            .forEach((t: unknown) => { const k = String(t); freq[k] = (freq[k] || 0) + 1; });
          dbSummary.push(`Designations: ${Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v})`).join(', ')}`);
        }
        dbEnrichment = dbSummary.join('\n');
      }
    } catch (e) {
      console.warn('[icp_infer] DB enrichment failed (non-fatal):', e instanceof Error ? e.message : String(e));
    }
  }

  // ── Step 3: Build ICP via Claude ──────────────────────────────────────────
  let icpHints: Record<string, unknown> = {};

  const contextSection = [
    crawledContext || `Product URL: ${product_url || 'not provided'}`,
    product_notes?.trim() ? `=== Founder Notes ===\n${product_notes.trim()}` : '',
    dbEnrichment ? `=== Real User Data ===\n${dbEnrichment}` : '',
  ].filter(Boolean).join('\n\n');

  try {
    const { data: llmIcp } = await callLLMJson<{
      industries: string[];
      designations: string[];
      company_sizes: string[];
      geographies: string[];
      pain_points: string[];
      value_proposition: string;
    }>(
      `You are building an Ideal Customer Profile (ICP) for a B2B SaaS product.

Product name: "${product_name}"

${contextSection}

Using the product content above as your PRIMARY signal (what the product says about itself and who it targets), infer the most accurate B2B ICP.
${product_notes?.trim() ? 'The Founder Notes above are first-hand knowledge from the founder — treat them as the highest-confidence signal, overriding the landing page where they conflict.' : ''}
${dbEnrichment ? 'The real user data above should CONFIRM or REFINE the ICP — not replace what the product copy says.' : ''}

Return JSON only:
{
  "industries": ["up to 5 most likely target industries"],
  "designations": ["up to 5 buyer/user job titles"],
  "company_sizes": ["e.g. SMB", "Mid-Market"],
  "geographies": ["primary target geographies"],
  "pain_points": ["3-5 key pain points this product solves"],
  "value_proposition": "one sentence summary of the core value"
}`,
      { model: 'haiku', max_tokens: 600, temperature: 0.3 },
    );
    icpHints = {
      industries: llmIcp.industries?.reduce((f: Record<string, number>, v: string) => { f[v] = 1; return f; }, {}),
      designations: llmIcp.designations?.reduce((f: Record<string, number>, v: string) => { f[v] = 1; return f; }, {}),
      company_sizes: llmIcp.company_sizes ?? [],
      pain_points: llmIcp.pain_points ?? [],
      geographies: llmIcp.geographies ?? [],
      value_proposition: llmIcp.value_proposition ?? '',
      source: crawledContext ? 'page_crawled' : 'llm_name_only',
    };
  } catch (err) {
    console.warn('[icp_infer] LLM inference failed:', err instanceof Error ? err.message : String(err));
  }

  await supabase
    .from('mkt_products')
    .update({ icp_hints: icpHints })
    .eq('org_id', org_id)
    .eq('product_key', product_key);

  const persisted = await persistICPFromOnboarding(
    supabase, org_id, product_key, icpHints, trialDays,
    (msg) => console.log(`[icp_infer] ${msg}`),
  );

  const source = String(icpHints.source ?? 'unknown');
  return {
    icp_persisted: persisted,
    source,
    page_crawled: !!pageText,
    repo_crawled: !!repoText,
    db_enriched: !!dbEnrichment,
  };
}

async function stepEmailTemplates(ctx: StepContext): Promise<Record<string, unknown>> {
  const { supabase, org_id, product_key } = ctx;

  // Skip check: are there already templates for this product?
  const { count: existing } = await supabase
    .from('mkt_email_templates')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', org_id)
    .ilike('name', `${product_key}-%`);

  if ((existing ?? 0) > 0) {
    return { skipped: true, reason: `${existing} email templates already exist`, count: existing };
  }

  // Load product info
  const { data: product } = await supabase
    .from('mkt_products')
    .select('product_name, product_url, icp_hints')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .single();

  const product_name = product?.product_name ?? product_key;
  const product_url = product?.product_url ?? ctx.product_url;
  const icpHints = (product?.icp_hints || {}) as Record<string, unknown>;

  const emailCategories = [
    { category: 'nurture',      description: "nurture sequence emails for leads who showed interest but haven't converted" },
    { category: 'closing',      description: 'closing emails to push trial users toward purchase' },
    { category: 'onboarding',   description: 'onboarding emails for new trial signups to help them get value' },
    { category: 'cold',         description: "cold outbound emails to new prospects who haven't heard of the product" },
    { category: 'reactivation', description: 'reactivation emails for churned or dormant users' },
  ];

  const icpContext = Object.keys(icpHints).length > 0 ? `ICP hints: ${JSON.stringify(icpHints)}` : '';

  const results = await Promise.all(
    emailCategories.map(async (cat) => {
      try {
        const { data: emails } = await callLLMJson<
          Array<{ name: string; subject: string; body_html: string; body_text: string }>
        >(
          `Generate 3 ${cat.description} for a B2B SaaS product called "${product_name}" (${product_url}).
${icpContext}

Each email must have:
- name: short identifier like "${product_key}-${cat.category}-1"
- subject: compelling subject line
- body_html: professional HTML email body (under 200 words)
- body_text: plain text version

Return a JSON array of 3 email objects.`,
          { model: 'haiku', max_tokens: 2048, temperature: 0.5 },
        );
        return Array.isArray(emails) ? emails.map((e) => ({ ...e, category: cat.category })) : [];
      } catch (err) {
        console.warn(`[email_templates] Failed to generate ${cat.category}: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    }),
  );

  const allEmails: Array<{
    name: string; subject: string; body_html: string; body_text: string; category: string;
  }> = results.flat();

  if (allEmails.length > 0) {
    const emailRows = allEmails.map((e) => ({
      org_id,
      name: e.name,
      subject: e.subject,
      body_html: e.body_html,
      body_text: e.body_text || '',
      category: mapEmailCategory(e.category),
      is_active: true,
    }));
    const { error: emailErr } = await supabase.from('mkt_email_templates').insert(emailRows);
    if (emailErr) throw new Error(`Email insert error: ${emailErr.message}`);
  }

  return { emails_generated: allEmails.length };
}

async function stepWhatsappTemplates(ctx: StepContext): Promise<Record<string, unknown>> {
  const { supabase, org_id, product_key } = ctx;

  // Skip check
  const { count: existing } = await supabase
    .from('mkt_whatsapp_templates')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', org_id)
    .ilike('name', `${product_key}-%`);

  if ((existing ?? 0) > 0) {
    return { skipped: true, reason: `${existing} WhatsApp templates already exist`, count: existing };
  }

  const { data: product } = await supabase
    .from('mkt_products')
    .select('product_name, product_url')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .single();

  const product_name = product?.product_name ?? product_key;
  const product_url = product?.product_url ?? ctx.product_url;
  const templateBase = product_key.replace(/-/g, '_');

  // Pick a version suffix to avoid collision with previously rejected template names on Meta.
  // Meta permanently blacklists rejected names — resubmissions must use a new name.
  const { data: existingNames } = await supabase
    .from('mkt_whatsapp_templates')
    .select('template_name')
    .eq('org_id', org_id)
    .ilike('template_name', `${templateBase}_welcome%`);
  const usedWelcomeNames = new Set((existingNames ?? []).map((r: { template_name: string }) => r.template_name));
  let vNum = 1;
  while (usedWelcomeNames.has(vNum === 1 ? `${templateBase}_welcome` : `${templateBase}_welcome_v${vNum}`)) {
    vNum++;
  }
  const versionSuffix = vNum === 1 ? '' : `_v${vNum}`;

  let waTemplates: Array<{
    name: string; template_name: string; body: string; category: string;
    variables: string[]; cta_url?: string; cta_button_text?: string;
  }> = [];

  const { data } = await callLLMJson<typeof waTemplates>(
    `Generate 4 WhatsApp message templates for a B2B SaaS product called "${product_name}".
Types needed: 1 welcome/intro, 1 trial reminder, 1 feature highlight, 1 reactivation.

CRITICAL META/WHATSAPP COMPLIANCE RULES — violations cause automatic rejection:
1. Body must NOT contain any URLs — put the URL in "cta_url" instead (rendered as a button)
2. Body must NOT ask users to "reply with KEYWORD" — this violates Meta policy
3. Every {{1}}, {{2}} placeholder must be listed in order in "variables" (e.g. ["first_name", "days_left"])
4. Keep body under 600 chars — shorter templates get approved faster
5. No HTML, no markdown — plain text only
6. "utility" category for transactional messages, "marketing" for promotional

Each template object must have:
- name: like "${product_key}-wa-welcome${versionSuffix}"
- template_name: lowercase + underscores only, e.g. "${templateBase}_welcome${versionSuffix}"
- body: message text using {{1}}, {{2}} for personalisation (NO URLs, NO reply instructions)
- category: "marketing" or "utility"
- variables: ordered array of variable names matching the placeholders, e.g. ["first_name", "days_left"]
- cta_url: "${product_url}" (the product URL — goes in the CTA button, not the body)
- cta_button_text: a short CTA label like "Get Started", "View Dashboard", "Upgrade Now"

Return a JSON array of exactly 4 template objects.`,
    { model: 'sonnet', max_tokens: 2048, temperature: 0.5 },
  );
  if (Array.isArray(data)) waTemplates = data;

  if (waTemplates.length === 0) {
    return { wa_templates_generated: 0 };
  }

  const waRows = waTemplates.map((w) => ({
    org_id,
    name: w.name,
    template_name: w.template_name,
    body: w.body,
    category: w.category || 'marketing',
    variables: Array.isArray(w.variables) ? w.variables : [],
    buttons: w.cta_url
      ? [{ type: 'URL', text: w.cta_button_text || 'Learn More', url: w.cta_url }]
      : [],
    approval_status: 'pending',
    is_active: true,
  }));
  const { error: waErr } = await supabase.from('mkt_whatsapp_templates').insert(waRows);
  if (waErr) throw new Error(`WhatsApp insert error: ${waErr.message}`);

  // Auto-submit to Exotel/Meta immediately after insert — no manual step needed
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const submitResp = await fetch(`${supabaseUrl}/functions/v1/mkt-submit-whatsapp-templates`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_id }),
  });
  const submitResult = submitResp.ok ? await submitResp.json() : { submitted: 0, failed: 0 };

  return {
    wa_templates_generated: waTemplates.length,
    wa_submitted: submitResult.submitted ?? 0,
    wa_failed: submitResult.failed ?? 0,
  };
}

async function stepCallScripts(ctx: StepContext): Promise<Record<string, unknown>> {
  const { supabase, org_id, product_key } = ctx;

  const SCRIPT_TYPES = ['intro', 'follow_up', 'demo', 'closing'] as const;
  const TARGET = SCRIPT_TYPES.length;

  // Check which types already exist
  const { data: existing } = await supabase
    .from('mkt_call_scripts')
    .select('call_type')
    .eq('org_id', org_id)
    .eq('product_key', product_key);

  const existingCount = existing?.length ?? 0;

  if (existingCount >= TARGET) {
    return { skipped: true, reason: `${existingCount} call scripts already exist`, count: existingCount };
  }

  // Find the next type not yet generated
  const existingTypes = new Set(existing?.map((s: { call_type: string }) => s.call_type) ?? []);
  const nextType = SCRIPT_TYPES.find((t) => !existingTypes.has(t));
  if (!nextType) {
    return { skipped: true, reason: 'All script types already generated', count: existingCount };
  }

  const { data: product } = await supabase
    .from('mkt_products')
    .select('product_name, product_url')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .single();

  const product_name = product?.product_name ?? product_key;
  const product_url = product?.product_url ?? ctx.product_url;

  type CallScript = {
    name: string; call_type: string; objective: string; opening: string;
    key_points: string[]; objection_handling: Record<string, string>; closing: string;
  };

  // Generate ONE script per invocation — keeps each LLM call well under timeout
  const { data: script } = await callLLMJson<CallScript>(
    `Generate ONE "${nextType}" phone call script for a B2B SaaS product called "${product_name}" (${product_url}).

The script must have:
- name: "${product_key}-call-${nextType.replace('_', '-')}"
- call_type: "${nextType}"
- objective: what the call aims to achieve (1 sentence)
- opening: how to start the call (2-3 sentences)
- key_points: array of 3-5 talking points
- objection_handling: object with 3 common objections as keys and responses as values
- closing: how to end the call (2-3 sentences)

Return a single JSON object (not an array).`,
    { model: 'sonnet', max_tokens: 1024, temperature: 0.5 },
  );

  const { error: scriptErr } = await supabase.from('mkt_call_scripts').insert({
    org_id,
    name: script.name,
    product_key,
    call_type: script.call_type,
    objective: script.objective,
    opening: script.opening,
    key_points: script.key_points,
    objection_handling: script.objection_handling,
    closing: script.closing,
    is_active: true,
  });
  if (scriptErr) throw new Error(`Call scripts insert error: ${scriptErr.message}`);

  const newCount = existingCount + 1;

  if (newCount < TARGET) {
    // Self-chain: signal the runner to re-invoke for the next script
    return { chain: true, generated_so_far: newCount, next_type: SCRIPT_TYPES.find((t) => !existingTypes.has(t) && t !== nextType) };
  }

  return { call_scripts_generated: newCount };
}

async function stepCampaignCreate(ctx: StepContext): Promise<Record<string, unknown>> {
  const { supabase, org_id, product_key } = ctx;

  // Skip check: campaign already exists for this product
  const { data: existingCampaign } = await supabase
    .from('mkt_campaigns')
    .select('id')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .limit(1)
    .single();

  if (existingCampaign) {
    // Campaign exists — but check if it has steps; if not, create them now
    const { count: existingSteps } = await supabase
      .from('mkt_campaign_steps')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', existingCampaign.id);

    if (!existingSteps || existingSteps === 0) {
      const stepRows = [
        { org_id, campaign_id: existingCampaign.id, step_number: 1, channel: 'email',    delay_hours: 0,   is_active: true },
        { org_id, campaign_id: existingCampaign.id, step_number: 2, channel: 'email',    delay_hours: 72,  is_active: true },
        { org_id, campaign_id: existingCampaign.id, step_number: 3, channel: 'whatsapp', delay_hours: 48,  is_active: true },
        { org_id, campaign_id: existingCampaign.id, step_number: 4, channel: 'email',    delay_hours: 96,  is_active: true },
        { org_id, campaign_id: existingCampaign.id, step_number: 5, channel: 'email',    delay_hours: 120, is_active: true },
      ];
      const { error: stepErr } = await supabase.from('mkt_campaign_steps').insert(stepRows);
      if (stepErr) throw new Error(`Campaign steps error: ${stepErr.message}`);
      return { campaign_id: existingCampaign.id, already_existed: true, steps_created: stepRows.length };
    }

    return { campaign_id: existingCampaign.id, already_existed: true };
  }

  const { data: product } = await supabase
    .from('mkt_products')
    .select('product_name')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .single();

  const product_name = product?.product_name ?? product_key;

  const { data: campaign, error: campErr } = await supabase
    .from('mkt_campaigns')
    .insert({
      org_id,
      product_key,
      name: `${product_name} - Initial Outbound`,
      campaign_type: 'outbound',
      status: 'draft',
      metadata: {},
    })
    .select('id')
    .single();

  if (campErr) throw new Error(`Campaign creation error: ${campErr.message}`);

  const steps = [
    { step_order: 1, channel: 'email',     delay_hours: 0,   action_type: 'send_email',     subject_line: 'Introduction' },
    { step_order: 2, channel: 'email',     delay_hours: 72,  action_type: 'send_email',     subject_line: 'Follow-up' },
    { step_order: 3, channel: 'whatsapp',  delay_hours: 48,  action_type: 'send_whatsapp',  subject_line: 'Quick check-in' },
    { step_order: 4, channel: 'email',     delay_hours: 96,  action_type: 'send_email',     subject_line: 'Value proposition' },
    { step_order: 5, channel: 'email',     delay_hours: 120, action_type: 'send_email',     subject_line: 'Last follow-up' },
  ];

  const stepRows = steps.map((s) => ({
    org_id,
    campaign_id: campaign.id,
    step_number: s.step_order,
    channel: s.channel,
    delay_hours: s.delay_hours,
    is_active: true,
  }));

  const { error: stepErr } = await supabase.from('mkt_campaign_steps').insert(stepRows);
  if (stepErr) throw new Error(`Campaign steps error: ${stepErr.message}`);

  return { campaign_id: campaign.id, steps_created: steps.length };
}

async function stepSourceLeads(ctx: StepContext): Promise<Record<string, unknown>> {
  const { supabase, org_id, product_key } = ctx;

  // Skip check: contacts >= 3000 this month for this product
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: contactsThisMonth } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', org_id)
    .eq('mkt_product_key', product_key)
    .gte('created_at', startOfMonth.toISOString());

  if ((contactsThisMonth ?? 0) >= 3000) {
    return {
      skipped: true,
      reason: `Contact pool already has ${contactsThisMonth} contacts this month (limit: 3000)`,
      contacts_count: contactsThisMonth,
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for mkt-source-leads invocation');
  }

  const resp = await fetch(`${supabaseUrl}/functions/v1/mkt-source-leads`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ org_id, product_key }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`mkt-source-leads returned ${resp.status}: ${errText}`);
  }

  const result = await resp.json();

  // After sourcing, enroll new contacts into any active campaign for this product.
  // This handles the case where the product toggle was activated before leads were available.
  const { data: activeCampaign } = await supabase
    .from('mkt_campaigns')
    .select('id')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .eq('status', 'active')
    .limit(1)
    .single();

  let totalEnrolled = 0;
  if (activeCampaign) {
    const campaign_id = activeCampaign.id as string;
    const { data: existing } = await supabase
      .from('mkt_sequence_enrollments')
      .select('lead_id')
      .eq('campaign_id', campaign_id);
    const enrolledIds = new Set((existing || []).map((e: Record<string, unknown>) => e.lead_id as string));

    const now = new Date().toISOString();
    let offset = 0;
    while (true) {
      const { data: batch } = await supabase
        .from('contacts')
        .select('id, org_id')
        .eq('org_id', org_id)
        .eq('mkt_product_key', product_key)
        .eq('status', 'new')
        .range(offset, offset + 999);

      if (!batch || batch.length === 0) break;

      const rows = (batch as Array<{ id: string; org_id: string }>)
        .filter((c) => !enrolledIds.has(c.id))
        .map((c) => ({
          org_id: c.org_id,
          lead_id: c.id,
          campaign_id,
          current_step: 1,
          status: 'active',
          next_action_at: now,
          enrolled_at: now,
        }));

      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from('mkt_sequence_enrollments').insert(rows.slice(i, i + 500));
      }
      totalEnrolled += rows.length;

      if (batch.length < 1000) break;
      offset += 1000;
    }
  }

  return { sourced: result, enrolled: totalEnrolled };
}

async function stepVapiAssistants(ctx: StepContext): Promise<Record<string, unknown>> {
  const { supabase, logger, org_id, product_key } = ctx;

  // Skip check: all scripts for this product already have vapi_assistant_id
  const { data: scripts } = await supabase
    .from('mkt_call_scripts')
    .select('id, name, product_key, call_type, objective, opening, key_points, objection_handling, closing, vapi_assistant_id')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .eq('is_active', true);

  if (!scripts || scripts.length === 0) {
    return { skipped: true, reason: 'No call scripts found for this product' };
  }

  const needsAssistant = scripts.filter((s: Record<string, unknown>) => !s.vapi_assistant_id);
  if (needsAssistant.length === 0) {
    return { skipped: true, reason: 'All call scripts already have Vapi assistants', count: scripts.length };
  }

  const vapiApiKey = Deno.env.get('VAPI_API_KEY');
  if (!vapiApiKey) throw new Error('VAPI_API_KEY not set');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // Load product info for system prompt
  const { data: product } = await supabase
    .from('mkt_products')
    .select('product_name, product_url')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .single();

  const product_name = product?.product_name ?? product_key;
  const product_url = product?.product_url ?? ctx.product_url;

  let assistantsCreated = 0;
  const assistantFailures: string[] = [];

  for (const row of needsAssistant) {
    try {
      const systemPrompt = buildOnboardSystemPrompt(row as Record<string, unknown>, product_name, product_url);

      const vapiPayload = {
        name: `${product_key}-${row.call_type}`,
        model: {
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          temperature: 0.4,
          messages: [{ role: 'system', content: systemPrompt }],
        },
        voice: {
          provider: 'elevenlabs',
          voiceId: Deno.env.get('VAPI_DEFAULT_VOICE_ID') || 'pNInz6obpgDQGcFmaJgB',
        },
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en-IN',
        },
        firstMessage: row.opening,
        endCallFunctionEnabled: true,
        recordingEnabled: true,
        serverUrl: `${supabaseUrl}/functions/v1/mkt-vapi-webhook`,
        serverUrlSecret: Deno.env.get('VAPI_WEBHOOK_SECRET') || undefined,
      };

      const vapiResp = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vapiPayload),
      });

      if (!vapiResp.ok) {
        const errText = await vapiResp.text();
        throw new Error(`Vapi ${vapiResp.status}: ${errText}`);
      }

      const vapiResult = await vapiResp.json();

      await supabase
        .from('mkt_call_scripts')
        .update({
          vapi_assistant_id: vapiResult.id,
          vapi_assistant_created_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      await logger.info('vapi-assistant-created', {
        product_key,
        call_type: row.call_type,
        assistant_id: vapiResult.id,
        script_id: row.id,
      });

      assistantsCreated++;
    } catch (err) {
      const errMsg = `${row.call_type}: ${err instanceof Error ? err.message : String(err)}`;
      assistantFailures.push(errMsg);
      await logger.error('vapi-assistant-creation-failed', err, {
        product_key,
        call_type: row.call_type,
        script_id: row.id,
      });
    }
  }

  if (assistantFailures.length > 0 && assistantsCreated === 0) {
    throw new Error(`All Vapi assistants failed: ${assistantFailures.join('; ')}`);
  }

  return {
    assistants_created: assistantsCreated,
    failures: assistantFailures.length,
    failure_details: assistantFailures,
  };
}

// ---------------------------------------------------------------------------
// Step dispatch table
// ---------------------------------------------------------------------------

type StepHandler = (ctx: StepContext) => Promise<Record<string, unknown>>;

const STEP_HANDLERS: Record<string, StepHandler> = {
  register:           stepRegister,
  schema_sniff:       stepSchemaSniff,
  icp_infer:          stepIcpInfer,
  email_templates:    stepEmailTemplates,
  whatsapp_templates: stepWhatsappTemplates,
  call_scripts:       stepCallScripts,
  campaign_create:    stepCampaignCreate,
  source_leads:       stepSourceLeads,
  vapi_assistants:    stepVapiAssistants,
};

// ---------------------------------------------------------------------------
// Step initialization
// ---------------------------------------------------------------------------

async function initializeSteps(
  supabase: SupabaseClient,
  org_id: string,
  product_key: string,
): Promise<void> {
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const stepDefs = [
    { step_name: 'register',           step_order: 1, scheduled_for: null },
    { step_name: 'schema_sniff',       step_order: 2, scheduled_for: null },
    { step_name: 'icp_infer',          step_order: 3, scheduled_for: null },
    { step_name: 'email_templates',    step_order: 4, scheduled_for: null },
    { step_name: 'whatsapp_templates', step_order: 5, scheduled_for: null },
    { step_name: 'call_scripts',       step_order: 6, scheduled_for: null },
    { step_name: 'campaign_create',    step_order: 7, scheduled_for: null },
    { step_name: 'source_leads',       step_order: 8, scheduled_for: null },
    { step_name: 'vapi_assistants',    step_order: 9, scheduled_for: sevenDaysLater.toISOString() },
  ];

  const rows = stepDefs.map((s) => ({
    org_id,
    product_key,
    step_name: s.step_name,
    step_order: s.step_order,
    status: 'pending',
    attempts: 0,
    scheduled_for: s.scheduled_for,
  }));

  // ON CONFLICT DO NOTHING — reruns don't reset completed steps
  await supabase
    .from('mkt_onboarding_steps')
    .upsert(rows, { onConflict: 'org_id,product_key,step_name', ignoreDuplicates: true });
}

// ---------------------------------------------------------------------------
// Step runner loop
// ---------------------------------------------------------------------------

async function runSteps(
  supabase: SupabaseClient,
  logger: ReturnType<typeof createEngineLogger>,
  org_id: string,
  product_key: string,
  product_url: string,
  git_repo_url: string,
  supabase_url: string,
  supabase_service_role_key: string,
  product_notes = '',
): Promise<StepResult[]> {
  const { data: steps, error: loadErr } = await supabase
    .from('mkt_onboarding_steps')
    .select('*')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .order('step_order', { ascending: true });

  if (loadErr) throw new Error(`Failed to load onboarding steps: ${loadErr.message}`);
  if (!steps || steps.length === 0) throw new Error(`No onboarding steps found for product_key="${product_key}"`);

  const ctx: StepContext = {
    supabase,
    logger,
    org_id,
    product_key,
    product_url,
    git_repo_url,
    product_notes,
    supabase_url,
    supabase_service_role_key,
  };

  const now = new Date();

  for (const step of steps as OnboardingStep[]) {
    // Already terminal
    if (step.status === 'complete' || step.status === 'skipped') continue;

    // Give up after 3 failed attempts
    if (step.status === 'failed' && step.attempts >= 3) continue;

    // Deferred (scheduled_for is in the future)
    if (step.scheduled_for && new Date(step.scheduled_for) > now) continue;

    const handler = STEP_HANDLERS[step.step_name];
    if (!handler) {
      await markStepFailed(supabase, step.id, `No handler registered for step "${step.step_name}"`);
      break;
    }

    // Mark in progress and bump attempts
    await markStepInProgress(supabase, step.id, step.attempts);

    try {
      const result = await handler(ctx);

      // Handler signalled self-chain: leave step in_progress and fire a new resume invocation
      if (result.chain) {
        await logger.info(`step-${step.step_name}-chaining`, { product_key, ...result });
        const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mkt-product-manager`;
        const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        fetch(fnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${svcKey}` },
          body: JSON.stringify({ mode: 'resume', org_id, product_key }),
        }).catch(() => {}); // fire-and-forget
        break; // don't advance to next steps in this invocation
      }

      // Check if handler signalled a skip
      if (result.skipped) {
        await markStepSkipped(supabase, step.id, String(result.reason ?? 'skipped by handler'));
      } else {
        await markStepComplete(supabase, step.id, result);
      }

      await logger.info(`step-${step.step_name}`, { product_key, ...result });

      // Gate: after icp_infer, pause until Amit finalizes the ICP
      if (step.step_name === 'icp_infer' && !result.skipped) {
        const { data: prod } = await supabase
          .from('mkt_products')
          .select('icp_finalized')
          .eq('org_id', org_id)
          .eq('product_key', product_key)
          .single();
        if (!prod?.icp_finalized) {
          await logger.info('icp-awaiting-finalization', { product_key, reason: 'ICP inferred — waiting for Amit to review and finalize before content generation' });
          break; // halt pipeline here; resume after finalize_icp is called
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await markStepFailed(supabase, step.id, errMsg);
      await logger.error(`step-${step.step_name}-failed`, err, { product_key, step_order: step.step_order });
      // Stop on failure — don't run subsequent steps
      break;
    }
  }

  // Reload all steps to return final state
  const { data: finalSteps } = await supabase
    .from('mkt_onboarding_steps')
    .select('step_name, status, completed_at, error, scheduled_for')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .order('step_order', { ascending: true });

  // Update product onboarding_status based on step outcomes.
  // A deferred-pending step (scheduled_for > now) counts as "done for now" —
  // it will run automatically when its scheduled_for time arrives.
  const runNow = new Date();
  const allDone = (finalSteps ?? []).every((s) =>
    s.status === 'complete' ||
    s.status === 'skipped' ||
    (s.status === 'pending' && s.scheduled_for && new Date(s.scheduled_for) > runNow),
  );
  const anyFailed = (finalSteps ?? []).some((s) => s.status === 'failed');
  if (allDone || anyFailed) {
    await supabase
      .from('mkt_products')
      .update({ onboarding_status: allDone ? 'complete' : 'failed' })
      .eq('org_id', org_id)
      .eq('product_key', product_key);
  }

  return (finalSteps ?? []).map((s: {
    step_name: string; status: string; completed_at: string | null; error: string | null; scheduled_for: string | null;
  }) => ({
    step_name: s.step_name,
    status: s.status,
    completed_at: s.completed_at,
    error: s.error,
  }));
}

// ---------------------------------------------------------------------------
// Mode handlers
// ---------------------------------------------------------------------------

async function handleOnboard(
  supabase: SupabaseClient,
  body: OnboardBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { org_id, product_name, product_url, git_repo_url = '', product_notes = '', supabase_url, supabase_service_role_key } = body;
  const product_key = deriveProductKey(product_name);

  // Initialize all step rows (idempotent)
  await initializeSteps(supabase, org_id, product_key);

  // Run the register step synchronously so the product row exists before we return.
  // The frontend can then show the product card immediately.
  const ctx: StepContext = { supabase, logger, org_id, product_key, product_url, git_repo_url, product_notes, supabase_url, supabase_service_role_key };
  const { data: registerRow } = await supabase
    .from('mkt_onboarding_steps')
    .select('id, attempts')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .eq('step_name', 'register')
    .single();

  if (registerRow) {
    await markStepInProgress(supabase, registerRow.id, registerRow.attempts);
    try {
      const result = await stepRegister(ctx);
      await markStepComplete(supabase, registerRow.id, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markStepFailed(supabase, registerRow.id, msg);
      await logger.error('step-register-failed', err, { product_key });
      throw err; // Surface to user — nothing to show if register fails
    }
  }

  // Fire remaining steps in the background. EdgeRuntime.waitUntil keeps the
  // function alive after the response is sent so the steps can complete.
  const bgRun = runSteps(supabase, logger, org_id, product_key, product_url, git_repo_url, supabase_url, supabase_service_role_key, product_notes)
    .catch((e) => logger.error('bg-steps-failed', e, { product_key }));

  // deno-lint-ignore no-explicit-any
  if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime.waitUntil(bgRun);
  }

  return { product_key };
}

async function handleResume(
  supabase: SupabaseClient,
  body: ResumeBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { org_id, product_key } = body;

  // Load the product to retrieve connection details stored during onboarding
  const { data: product, error: prodErr } = await supabase
    .from('mkt_products')
    .select('product_url, git_repo_url, product_notes, supabase_url, supabase_secret_name')
    .eq('org_id', org_id)
    .eq('product_key', product_key)
    .single();

  if (prodErr || !product) {
    throw new Error(`Product "${product_key}" not found for org "${org_id}"`);
  }

  // Retrieve the service role key from env (set as a Supabase secret)
  const serviceRoleKey = product.supabase_secret_name
    ? Deno.env.get(product.supabase_secret_name) ?? ''
    : '';

  const steps = await runSteps(
    supabase, logger,
    org_id, product_key,
    product.product_url ?? '',
    product.git_repo_url ?? '',
    product.supabase_url ?? '',
    serviceRoleKey,
    product.product_notes ?? '',
  );

  return { product_key, steps };
}

// ---------------------------------------------------------------------------
// TOGGLE
// ---------------------------------------------------------------------------

async function handleToggle(
  supabase: SupabaseClient,
  body: ToggleBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { product_id, active } = body;

  const { error } = await supabase.rpc('toggle_product_active', {
    _product_id: product_id,
    _active: active,
  });

  if (error) throw new Error(`toggle_product_active failed: ${error.message}`);

  const { data: product } = await supabase
    .from('mkt_products')
    .select('id, product_key, product_name, active, org_id')
    .eq('id', product_id)
    .single();

  await logger.info('product-toggled', { product_id, active, product_key: product?.product_key });

  if (active && product) {
    const { product_key, org_id } = product as { product_key: string; org_id: string };

    // Find all campaigns for this product
    const { data: campaigns } = await supabase
      .from('mkt_campaigns')
      .select('id')
      .eq('org_id', org_id)
      .eq('product_key', product_key);

    for (const campaign of (campaigns || [])) {
      const campaign_id = campaign.id as string;

      // Check step count — FieldSync was onboarded before ICP existed, so steps may be missing
      const { count: stepCount } = await supabase
        .from('mkt_campaign_steps')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign_id);

      if (!stepCount || stepCount === 0) {
        // Reset campaign_create so runSteps recreates the steps, then stop here —
        // the next activation will proceed with steps in place
        await supabase.from('mkt_onboarding_steps')
          .update({ status: 'pending', attempts: 0, error: null, completed_at: null, details: null })
          .eq('org_id', org_id).eq('product_key', product_key).eq('step_name', 'campaign_create');
        await logger.info('campaign-steps-missing-reset', { org_id, product_key, campaign_id });
        continue;
      }

      // Fetch steps in order
      const { data: steps } = await supabase
        .from('mkt_campaign_steps')
        .select('id, step_number, channel, template_id')
        .eq('campaign_id', campaign_id)
        .order('step_number');

      // Fetch templates by product_key prefix (naming convention: productkey_*)
      const [{ data: emailTpls }, { data: waTpls }] = await Promise.all([
        supabase.from('mkt_email_templates')
          .select('id')
          .eq('org_id', org_id)
          .ilike('name', `${product_key}%`)
          .eq('is_active', true)
          .order('created_at'),
        supabase.from('mkt_whatsapp_templates')
          .select('id')
          .eq('org_id', org_id)
          .ilike('template_name', `${product_key}%`)
          .eq('approval_status', 'approved')
          .order('created_at'),
      ]);

      // Link templates to steps in sequence order (email steps cycle through email templates, WA through WA)
      let emailIdx = 0, waIdx = 0;
      for (const step of (steps || [])) {
        if (step.template_id) continue; // already linked
        let tplId: string | null = null;
        if (step.channel === 'email' && emailTpls && emailIdx < emailTpls.length) {
          tplId = (emailTpls[emailIdx++] as { id: string }).id;
        } else if (step.channel === 'whatsapp' && waTpls && waIdx < waTpls.length) {
          tplId = (waTpls[waIdx++] as { id: string }).id;
        }
        if (tplId) {
          await supabase.from('mkt_campaign_steps').update({ template_id: tplId }).eq('id', step.id as string);
        }
      }

      // Activate campaign
      await supabase.from('mkt_campaigns')
        .update({ status: 'active', start_date: new Date().toISOString() })
        .eq('id', campaign_id);

      // Thaw any enrollments that were frozen by the toggle-off sentinel (2099-12-31)
      const PAUSE_SENTINEL = '2099-12-31T23:59:59Z';
      await supabase
        .from('mkt_sequence_enrollments')
        .update({ next_action_at: new Date().toISOString() })
        .eq('campaign_id', campaign_id)
        .eq('status', 'active')
        .eq('next_action_at', PAUSE_SENTINEL);

      // Bulk enroll contacts (status='new') — skip any already enrolled to avoid duplicates
      const { data: existing } = await supabase
        .from('mkt_sequence_enrollments')
        .select('lead_id')
        .eq('campaign_id', campaign_id);
      const enrolledIds = new Set((existing || []).map((e: Record<string, unknown>) => e.lead_id as string));

      // Paginate contacts in chunks of 1000 (PostgREST max per request)
      const now = new Date().toISOString();
      let offset = 0;
      let totalEnrolled = 0;
      while (true) {
        const { data: batch } = await supabase
          .from('contacts')
          .select('id, org_id')
          .eq('org_id', org_id)
          .eq('mkt_product_key', product_key)
          .eq('status', 'new')
          .range(offset, offset + 999);

        if (!batch || batch.length === 0) break;

        const rows = (batch as Array<{ id: string; org_id: string }>)
          .filter((c) => !enrolledIds.has(c.id))
          .map((c) => ({
            org_id: c.org_id,
            lead_id: c.id,
            campaign_id,
            current_step: 1,
            status: 'active',
            next_action_at: now,
            enrolled_at: now,
          }));

        for (let i = 0; i < rows.length; i += 500) {
          await supabase.from('mkt_sequence_enrollments').insert(rows.slice(i, i + 500));
        }
        totalEnrolled += rows.length;

        if (batch.length < 1000) break;
        offset += 1000;
      }

      await logger.info('campaign-activated', { org_id, product_key, campaign_id, enrolled: totalEnrolled });
    }
  } else if (!active && product) {
    const offOrg = (product as { org_id: string }).org_id;
    const offKey = (product as { product_key: string }).product_key;

    // 1. Pause all campaigns for this product
    await supabase.from('mkt_campaigns')
      .update({ status: 'paused' })
      .eq('org_id', offOrg)
      .eq('product_key', offKey);

    // 2. Immediately freeze all active enrollments so they don't keep
    //    flooding the executor batch queue while the campaign drains.
    //    Sentinel value 2099-12-31 signals "paused by product toggle".
    const PAUSE_SENTINEL = '2099-12-31T23:59:59Z';
    const { data: offCampaigns } = await supabase
      .from('mkt_campaigns')
      .select('id')
      .eq('org_id', offOrg)
      .eq('product_key', offKey);

    if (offCampaigns && offCampaigns.length > 0) {
      const offCampaignIds = offCampaigns.map((c: Record<string, unknown>) => c.id as string);
      // Batch-update in chunks of 500 to avoid URL length limits
      for (let i = 0; i < offCampaignIds.length; i += 500) {
        await supabase
          .from('mkt_sequence_enrollments')
          .update({ next_action_at: PAUSE_SENTINEL })
          .in('campaign_id', offCampaignIds.slice(i, i + 500))
          .eq('status', 'active');
      }
      await logger.info('enrollments-frozen', { org_id: offOrg, product_key: offKey, campaigns: offCampaignIds.length });
    }
  }

  return { product_id, active, product: product || null };
}

// ---------------------------------------------------------------------------
// SYNC
// ---------------------------------------------------------------------------

async function handleSync(
  supabase: SupabaseClient,
  body: SyncBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { org_id } = body;

  const { data: products, error: fetchErr } = await supabase
    .from('mkt_products')
    .select('*')
    .eq('org_id', org_id)
    .not('supabase_url', 'is', null);

  if (fetchErr) throw new Error(`Failed to fetch products: ${fetchErr.message}`);
  if (!products || products.length === 0) {
    return { synced: 0, message: 'No products with supabase_url found' };
  }

  const results: Array<Record<string, unknown>> = [];

  for (const product of products) {
    const syncResult: Record<string, unknown> = {
      product_key: product.product_key,
      product_name: product.product_name,
    };

    try {
      const serviceKey = getProductServiceKey(product.product_name);
      if (!serviceKey) {
        syncResult.status = 'skipped';
        syncResult.reason = `Missing env var: ${deriveInitials(product.product_name)}_SUPABASE_SERVICE_KEY`;
        results.push(syncResult);
        continue;
      }

      const productClient = createProductClient(product.supabase_url, serviceKey);
      const schemaMap = (product.schema_map || {}) as Record<string, string>;
      const dataBefore: Record<string, unknown> = {};
      const dataAfter: Record<string, unknown> = {};

      if (schemaMap.registrations_table) {
        const { count: totalUsers } = await productClient
          .from(schemaMap.registrations_table)
          .select('*', { count: 'exact', head: true });
        dataAfter.total_users = totalUsers || 0;
      }

      if (schemaMap.payments_table) {
        const { count: paidCount } = await productClient
          .from(schemaMap.payments_table)
          .select('*', { count: 'exact', head: true });
        dataAfter.total_payments = paidCount || 0;
      }

      if (schemaMap.pricing_table) {
        const { data: pricing } = await productClient
          .from(schemaMap.pricing_table)
          .select('*')
          .limit(10);
        dataAfter.pricing = pricing || [];
      }

      const { data: lastSync } = await supabase
        .from('mkt_product_sync_log')
        .select('data_after')
        .eq('org_id', org_id)
        .eq('product_key', product.product_key)
        .order('synced_at', { ascending: false })
        .limit(1)
        .single();

      if (lastSync?.data_after) {
        Object.assign(dataBefore, lastSync.data_after);
      }

      const pricingChanged =
        JSON.stringify(dataBefore.pricing) !== JSON.stringify(dataAfter.pricing) &&
        dataBefore.pricing !== undefined;

      if (pricingChanged) {
        await logger.warn('pricing-changed', {
          product_key: product.product_key,
          message: 'Pricing changed — content regeneration may be needed',
        });
        syncResult.pricing_changed = true;
      }

      await supabase
        .from('mkt_products')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', product.id);

      await supabase.from('mkt_product_sync_log').insert({
        org_id,
        product_key: product.product_key,
        sync_type: 'full',
        data_before: dataBefore,
        data_after: dataAfter,
        changes_detected: JSON.stringify(dataBefore) !== JSON.stringify(dataAfter),
      });

      syncResult.status = 'synced';
      syncResult.data = dataAfter;
      syncResult.changes_detected = JSON.stringify(dataBefore) !== JSON.stringify(dataAfter);
    } catch (err) {
      syncResult.status = 'error';
      syncResult.error = err instanceof Error ? err.message : String(err);
      await logger.error('sync-product-failed', err, { product_key: product.product_key });
    }

    results.push(syncResult);
  }

  await logger.info('sync-complete', {
    org_id,
    products_synced: results.filter((r) => r.status === 'synced').length,
    products_skipped: results.filter((r) => r.status === 'skipped').length,
    products_errored: results.filter((r) => r.status === 'error').length,
  });

  return {
    synced: results.filter((r) => r.status === 'synced').length,
    total: results.length,
    results,
  };
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

async function handleDelete(
  supabase: SupabaseClient,
  body: DeleteBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { org_id, product_key } = body;

  const tablesToClear: string[] = [
    'mkt_arohan_conversations',
    'mkt_onboarding_steps',
    'mkt_product_icp',
    'mkt_email_templates',
    'mkt_whatsapp_templates',
    'mkt_call_scripts',
    'mkt_engine_logs',
    'mkt_engine_config',
    'mkt_campaign_steps',
  ];

  // Delete campaign_steps via campaign_id first (no product_key column)
  const { data: campaigns } = await supabase
    .from('mkt_campaigns')
    .select('id')
    .eq('org_id', org_id)
    .eq('product_key', product_key);

  if (campaigns && campaigns.length > 0) {
    const ids = campaigns.map((c: { id: string }) => c.id);
    await supabase.from('mkt_campaign_steps').delete().in('campaign_id', ids);
    await supabase.from('mkt_campaigns').delete().in('id', ids);
  }

  // Delete all tables that have org_id + product_key
  for (const table of ['mkt_onboarding_steps', 'mkt_product_icp', 'mkt_email_templates',
    'mkt_whatsapp_templates', 'mkt_call_scripts']) {
    await supabase.from(table).delete().eq('org_id', org_id).eq('product_key', product_key);
  }

  // Delete tables that only filter by org_id (shared across products)
  // Only clear engine logs for this product_key
  await supabase.from('mkt_engine_logs').delete()
    .eq('org_id', org_id)
    .contains('details', { product_key });

  // Delete the product row itself
  await supabase.from('mkt_products').delete()
    .eq('org_id', org_id)
    .eq('product_key', product_key);

  await logger.info('product-deleted', { org_id, product_key });

  return { deleted: true, product_key };
}

// ---------------------------------------------------------------------------
// RESET STEP
// ---------------------------------------------------------------------------

/** Delete whatever a step wrote so it can be cleanly re-executed. */
async function clearStepOutput(
  supabase: SupabaseClient,
  org_id: string,
  product_key: string,
  step_name: string,
): Promise<void> {
  switch (step_name) {
    case 'schema_sniff':
      await supabase.from('mkt_products')
        .update({ schema_map: null, trial_days: 14 })
        .eq('org_id', org_id).eq('product_key', product_key);
      break;
    case 'icp_infer':
      await supabase.from('mkt_product_icp')
        .delete().eq('org_id', org_id).eq('product_key', product_key).eq('version', 1);
      await supabase.from('mkt_products')
        .update({ icp_hints: null })
        .eq('org_id', org_id).eq('product_key', product_key);
      break;
    case 'email_templates':
      await supabase.from('mkt_email_templates')
        .delete().eq('org_id', org_id).ilike('name', `${product_key}-%`);
      break;
    case 'whatsapp_templates':
      await supabase.from('mkt_whatsapp_templates')
        .delete().eq('org_id', org_id).ilike('name', `${product_key}-%`);
      break;
    case 'call_scripts':
      await supabase.from('mkt_call_scripts')
        .delete().eq('org_id', org_id).eq('product_key', product_key);
      break;
    case 'campaign_create': {
      const { data: camps } = await supabase.from('mkt_campaigns')
        .select('id').eq('org_id', org_id).eq('product_key', product_key);
      if (camps && camps.length > 0) {
        const ids = camps.map((c: { id: string }) => c.id);
        await supabase.from('mkt_campaign_steps').delete().in('campaign_id', ids);
        await supabase.from('mkt_campaigns').delete().in('id', ids);
      }
      break;
    }
    // register, source_leads, vapi_assistants — no destructive cleanup
  }
}

async function handleResetStep(
  supabase: SupabaseClient,
  body: ResetStepBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { org_id, product_key, step_name } = body;

  // 1. Delete previous output for this step
  await clearStepOutput(supabase, org_id, product_key, step_name);

  // 2. Reset the step row to pending
  await supabase.from('mkt_onboarding_steps')
    .update({ status: 'pending', attempts: 0, error: null, completed_at: null, details: null })
    .eq('org_id', org_id).eq('product_key', product_key).eq('step_name', step_name);

  // 3. Reset product-level status so it doesn't stay stuck at 'complete' or 'failed'
  await supabase.from('mkt_products')
    .update({ onboarding_status: 'in_progress' })
    .eq('org_id', org_id).eq('product_key', product_key);

  // 4. Load product connection details and re-run steps
  const { data: product } = await supabase.from('mkt_products')
    .select('product_url, git_repo_url, product_notes, supabase_url, supabase_secret_name')
    .eq('org_id', org_id).eq('product_key', product_key).single();

  const serviceRoleKey = product?.supabase_secret_name
    ? Deno.env.get(product.supabase_secret_name) ?? '' : '';

  const steps = await runSteps(
    supabase, logger,
    org_id, product_key,
    product?.product_url ?? '',
    product?.git_repo_url ?? '',
    product?.supabase_url ?? '',
    serviceRoleKey,
    product?.product_notes ?? '',
  );

  await logger.info('step-reset', { product_key, step_name });
  return { product_key, step_name, steps };
}

// ---------------------------------------------------------------------------
// refresh_content — atomically wipe + regenerate all 3 content steps
// Called automatically after every ICP evolution (manual or cron-driven).
// Running a single runSteps() call avoids the race condition that 3 parallel
// reset_step calls would create (each invoking runSteps concurrently).
// ---------------------------------------------------------------------------

const CONTENT_STEPS = ['email_templates', 'whatsapp_templates', 'call_scripts'] as const;

async function handleRefreshContent(
  supabase: SupabaseClient,
  body: RefreshContentBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { org_id, product_key } = body;

  // 1. Delete stale content for all 3 steps
  for (const step_name of CONTENT_STEPS) {
    await clearStepOutput(supabase, org_id, product_key, step_name);
  }

  // 2. Reset all 3 step rows to pending in one query
  await supabase.from('mkt_onboarding_steps')
    .update({ status: 'pending', attempts: 0, error: null, completed_at: null, details: null })
    .eq('org_id', org_id).eq('product_key', product_key).in('step_name', [...CONTENT_STEPS]);

  // 3. Mark product as in_progress so status reflects regeneration
  await supabase.from('mkt_products')
    .update({ onboarding_status: 'in_progress' })
    .eq('org_id', org_id).eq('product_key', product_key);

  // 4. Load product connection details and run all pending steps once (sequential, no race)
  const { data: product } = await supabase.from('mkt_products')
    .select('product_url, git_repo_url, product_notes, supabase_url, supabase_secret_name')
    .eq('org_id', org_id).eq('product_key', product_key).single();

  const serviceRoleKey = product?.supabase_secret_name
    ? Deno.env.get(product.supabase_secret_name) ?? '' : '';

  const steps = await runSteps(
    supabase, logger,
    org_id, product_key,
    product?.product_url ?? '',
    product?.git_repo_url ?? '',
    product?.supabase_url ?? '',
    serviceRoleKey,
    product?.product_notes ?? '',
  );

  await logger.info('content-refreshed', { org_id, product_key, steps_run: CONTENT_STEPS.length });
  return { org_id, product_key, steps };
}

// ---------------------------------------------------------------------------
// finalize_icp — Amit has reviewed the ICP; unlock content generation steps
// ---------------------------------------------------------------------------

async function handleFinalizeIcp(
  supabase: SupabaseClient,
  body: FinalizeIcpBody,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<Record<string, unknown>> {
  const { org_id, product_key } = body;

  const { error } = await supabase
    .from('mkt_products')
    .update({ icp_finalized: true })
    .eq('org_id', org_id)
    .eq('product_key', product_key);

  if (error) throw new Error(`Failed to finalize ICP: ${error.message}`);

  await logger.info('icp-finalized', { org_id, product_key });

  // Resume the pipeline — will now proceed past the icp_infer gate into email_templates etc.
  return handleResume(supabase, { mode: 'resume', org_id, product_key }, logger);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-product-manager');

  try {
    const supabase = getSupabaseClient();
    const body: RequestBody = await req.json();
    const mode = body.mode;

    let result: Record<string, unknown> = {};

    switch (mode) {
      case 'onboard':
        result = await handleOnboard(supabase, body as OnboardBody, logger);
        break;
      case 'resume':
        result = await handleResume(supabase, body as ResumeBody, logger);
        break;
      case 'toggle':
        result = await handleToggle(supabase, body as ToggleBody, logger);
        break;
      case 'sync':
        result = await handleSync(supabase, body as SyncBody, logger);
        break;
      case 'delete':
        result = await handleDelete(supabase, body as DeleteBody, logger);
        break;
      case 'reset_step':
        result = await handleResetStep(supabase, body as ResetStepBody, logger);
        break;
      case 'refresh_content':
        result = await handleRefreshContent(supabase, body as RefreshContentBody, logger);
        break;
      case 'finalize_icp':
        result = await handleFinalizeIcp(supabase, body as FinalizeIcpBody, logger);
        break;
      default:
        throw new Error(`Unknown mode: ${(body as Record<string, unknown>).mode}`);
    }

    return new Response(
      JSON.stringify({ success: true, mode, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    await logger.error('product-manager-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
