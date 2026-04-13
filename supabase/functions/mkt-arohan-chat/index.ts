import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLMJson } from '../_shared/llmClient.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatBody {
  org_id: string;
  thread_id: string;
  message: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SuggestionPayload {
  type: 'icp_update' | 'campaign_launch' | 'campaign_pause' | 'campaign_resume' | 'regenerate_step' | 'none';
  product_key?: string;
  step_name?: string;
  field?: string;
  value?: unknown;
  icp_patch?: Record<string, unknown>; // full multi-field patch for icp_update
  reason?: string;
}

interface SuggestionClassification {
  is_suggestion: boolean;
  suggestion_payload: SuggestionPayload | null;
}

interface ICPRow {
  product_key: string;
  industries: string[];
  company_sizes: string[];
  designations: string[];
  geographies: string[];
  languages: string[];
  pain_points: string[];
  aha_moment_days: number | null;
  budget_range: { min_paise: number; max_paise: number; currency: string };
  confidence_score: number;
  version: number;
}

// ---------------------------------------------------------------------------
// Landing page crawler (strips HTML → plain text, max 6000 chars)
// ---------------------------------------------------------------------------

async function crawlPageContent(url: string): Promise<string> {
  if (!url) return '';
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Arohan-Revenue-Engine/1.0 (chat-context)' },
    });
    if (!resp.ok) return '';
    const html = await resp.text();
    return html
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
  } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Multi-turn Anthropic call (Arohan needs full conversation history)
// ---------------------------------------------------------------------------

async function callArohan(
  messages: ConversationMessage[],
  systemPrompt: string,
): Promise<{ content: string; input_tokens: number; output_tokens: number }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    temperature: 0.4,
    system: systemPrompt,
    messages,
  };

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        if ((response.status === 429 || response.status === 529) && attempt < 3) {
          const wait = response.status === 429
            ? parseInt(response.headers.get('retry-after') || '5', 10) * 1000
            : 1000 * attempt;
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw new Error(`Anthropic error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const textBlock = data.content?.find((b: { type: string }) => b.type === 'text');
      return {
        content: textBlock?.text || '',
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw lastError || new Error('Arohan LLM call failed');
}

// ---------------------------------------------------------------------------
// Context Loader
// ---------------------------------------------------------------------------

async function loadContext(
  supabase: ReturnType<typeof getSupabaseClient>,
  orgId: string,
  threadId: string,
) {
  const [productsRes, icpsRes, campaignsRes, pendingRes, historyRes, waTemplatesRes] = await Promise.all([
    supabase
      .from('mkt_products')
      .select('product_key, product_name, active, onboarding_status, product_url, schema_map, trial_days')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),

    supabase.rpc('get_all_current_icps', { _org_id: orgId }),

    supabase
      .from('mkt_campaigns')
      .select('name, product_key, status, channel, total_leads, converted_count')
      .eq('org_id', orgId)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false })
      .limit(10),

    supabase
      .from('mkt_arohan_conversations')
      .select('message, suggestion_payload, created_at')
      .eq('org_id', orgId)
      .eq('is_suggestion', true)
      .eq('suggestion_applied', false)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('mkt_arohan_conversations')
      .select('role, message')
      .eq('org_id', orgId)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(20),

    supabase
      .from('mkt_whatsapp_templates')
      .select('name, template_name, approval_status, submission_error')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const products = (productsRes.data || []) as Array<{
    product_key: string; product_name: string; active: boolean;
    onboarding_status: string; product_url: string | null;
    schema_map: Record<string, string> | null; trial_days: number | null;
  }>;

  // Crawl landing pages in parallel (best-effort; timeouts silently return '')
  const landingPages: Array<{ product_key: string; content: string }> = await Promise.all(
    products.map(async (p) => ({
      product_key: p.product_key,
      content: p.product_url ? await crawlPageContent(p.product_url) : '',
    }))
  );

  return {
    products,
    icps: (icpsRes.data || []) as ICPRow[],
    campaigns: campaignsRes.data || [],
    pendingSuggestions: pendingRes.data || [],
    threadHistory: (historyRes.data || []) as Array<{ role: string; message: string }>,
    waTemplates: (waTemplatesRes.data || []) as Array<{ name: string; template_name: string; approval_status: string; submission_error: string | null }>,
    landingPages,
  };
}

// ---------------------------------------------------------------------------
// Suggestion Classifier (Haiku — cheap, fast)
// ---------------------------------------------------------------------------

async function classifySuggestion(
  message: string,
  lastArohanMessage?: string,
): Promise<SuggestionClassification> {
  const contextBlock = lastArohanMessage
    ? `\nPrevious Arohan message (context for short confirmations like "Yes" / "Go ahead"):\n"${lastArohanMessage.slice(0, 1500)}"\n`
    : '';

  const prompt = `You are classifying a message from a business founder to their AI revenue engine called Arohan.
${contextBlock}
Current message: "${message}"

Is this message (or a short confirmation of the previous Arohan proposal above) an actionable suggestion?

Return JSON only:
{
  "is_suggestion": true | false,
  "suggestion_payload": {
    "type": "icp_update" | "campaign_launch" | "campaign_pause" | "campaign_resume" | "regenerate_step" | "none",
    "product_key": "string or null",
    "step_name": "whatsapp_templates | email_templates | call_scripts | icp_infer | campaign_create | source_leads | null",
    "field": "industries | company_sizes | designations | geographies | languages | pain_points | null",
    "value": ["array", "of", "values"] | null,
    "icp_patch": {
      "industries": [...] | null,
      "designations": [...] | null,
      "company_sizes": [...] | null,
      "geographies": [...] | null,
      "pain_points": [...] | null
    } | null,
    "reason": "brief reason string or null"
  } | null
}

Type guide:
- "icp_update": user wants to change ICP targeting. If the previous Arohan message proposed a FULL ICP update (multiple fields), populate icp_patch with ALL proposed fields extracted from that message. Set field/value only for single-field changes.
- "campaign_launch": user wants to launch/start/activate/run a campaign for a product
- "campaign_pause": user wants to pause/stop a campaign
- "campaign_resume": user wants to resume/restart a paused campaign
- "regenerate_step": user wants to regenerate/redo/recreate a step output
  → set step_name to: whatsapp_templates, email_templates, call_scripts, icp_infer, campaign_create, source_leads
  → set product_key if mentioned
- "none": informational question or general conversation

IMPORTANT: If the current message is a short confirmation ("Yes", "Ok", "Sure", "Go ahead", "Do it") and the previous Arohan message proposed specific changes — treat this as confirmation of those changes and extract the full action from context.

If not a suggestion, set is_suggestion to false and suggestion_payload to null.`;

  try {
    const { data } = await callLLMJson<SuggestionClassification>(prompt, {
      model: 'haiku',
      max_tokens: 600,
    });
    return data;
  } catch {
    return { is_suggestion: false, suggestion_payload: null };
  }
}

// ---------------------------------------------------------------------------
// System Prompt Builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  context: Awaited<ReturnType<typeof loadContext>>,
): string {
  const icpLines = context.icps.map((icp) =>
    [
      `• ${icp.product_key} — v${icp.version}, ${Math.round(icp.confidence_score * 100)}% confidence`,
      icp.industries.length ? `  Industries: ${icp.industries.join(', ')}` : null,
      icp.designations.length ? `  Designations: ${icp.designations.join(', ')}` : null,
      icp.company_sizes.length ? `  Company sizes: ${icp.company_sizes.join(', ')}` : null,
      icp.geographies.length ? `  Geographies: ${icp.geographies.join(', ')}` : null,
      icp.pain_points.length ? `  Pain points: ${icp.pain_points.join(', ')}` : null,
    ].filter(Boolean).join('\n')
  ).join('\n\n') || 'No ICPs available yet.';

  const campaignLines = context.campaigns.length
    ? context.campaigns.map((c) =>
        `• ${c.name} [${c.channel || 'unknown'}, ${c.status}]: ${c.total_leads ?? 0} leads → ${c.converted_count ?? 0} converted`
      ).join('\n')
    : 'No active campaigns.';

  const pendingLines = context.pendingSuggestions.length
    ? context.pendingSuggestions.map((s) => `• "${s.message}"`).join('\n')
    : 'None.';

  const waLines = context.waTemplates.length
    ? context.waTemplates.map((t) =>
        `• ${t.template_name} — ${t.approval_status}${t.submission_error ? ` (${t.submission_error})` : ''}`
      ).join('\n')
    : 'No WhatsApp templates yet.';

  const landingPageLines = context.landingPages
    .filter((lp) => lp.content.length > 0)
    .map((lp) => `### ${lp.product_key}\n${lp.content}`)
    .join('\n\n') || 'No landing page content available.';

  const schemaLines = context.products
    .map((p) => {
      const map = p.schema_map as Record<string, unknown> | null;
      if (!map || Object.keys(map).length === 0) return `• ${p.product_key}: schema not yet scanned`;
      const allTables = Array.isArray(map.all_tables) ? (map.all_tables as string[]) : [];
      const roleEntries = Object.entries(map)
        .filter(([k]) => k.endsWith('_table'))
        .map(([role, tbl]) => `${tbl} (${role.replace('_table', '')})`);
      const roleStr = roleEntries.length > 0 ? `key tables: ${roleEntries.join(', ')}` : '';
      const allStr = allTables.length > 0 ? `all tables: ${allTables.join(', ')}` : '';
      const tableStr = [roleStr, allStr].filter(Boolean).join(' | ');
      return `• ${p.product_key}: ${tableStr} — trial_days=${p.trial_days ?? 14}`;
    })
    .join('\n') || 'No schema data available.';

  return `You are Arohan — the autonomous revenue engine for In-Sync. You are a strategic AI advisor helping Amit (the founder/operator) understand performance, refine targeting strategy, and make data-driven decisions.

## Identity
- Arohan means "ascent" — always moving the business upward
- You manage 5 revenue loops: acquisition → activation → retention → expansion → referral
- Channels unlock by milestone: M3=Vapi calling, M4=Google Ads + Global Persona Intelligence, M5=Meta Ads, M6=LinkedIn
- You are direct, data-driven, and proactively surface insights

## CRITICAL: Your data access
- The context sections below (Products, ICPs, Campaigns, Templates, Landing Pages) ARE your live view of Amit's database — fetched fresh for every message.
- NEVER say you "can't see the database", "don't have visibility", or "can't verify" data. If a section says "No ICPs available yet" then there genuinely are none — say that directly.
- NEVER suggest Amit check elsewhere to confirm what you can already see here. You ARE the system.

## Persona
- Speak in clear business language — no tech jargon
- When data is missing (e.g. no ICPs yet), say so plainly and explain what needs to happen to populate it
- When Amit makes an ICP suggestion, evaluate it critically and say whether you will apply it
- When applying a suggestion, state: "Applying this to [product_key] ICP now."
- Keep responses focused: 2–4 short paragraphs or a tight bullet list

## Current Date
${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}

## Product Database Schemas
${schemaLines}

## Product Landing Pages
${landingPageLines}

## Active Products & Current ICPs
${icpLines}

## Active Campaigns
${campaignLines}

## WhatsApp Templates
${waLines}

## Pending Suggestions (not yet applied)
${pendingLines}

## Actions you can take
- Update an ICP field (industries, designations, company_sizes, geographies, pain_points)
- Launch a campaign: enroll all eligible leads and start sending immediately
- Pause a campaign: halt all active enrollments
- Resume a campaign: restart paused enrollments
- Regenerate a step: whatsapp_templates, email_templates, call_scripts, icp_infer, campaign_create, source_leads
  → When Amit asks to redo/recreate/regenerate any of these, you will trigger it automatically.

## CRITICAL: How your actions work
- You ARE wired to the database. When Amit confirms a change, the system executes it automatically — a green badge appears in the UI confirming it ran.
- NEVER say you "can't write to the database" or "don't have write capability" — you do.
- When Amit confirms a change, say: "Requesting the update now — a green badge will confirm when it's applied."
- If no badge appears after confirmation, say: "The action may not have triggered — please try rephrasing your request."
- Do NOT pre-emptively tell Amit to ask his tech team. You are the system.`;
}

// ---------------------------------------------------------------------------
// ICP Update Action
// ---------------------------------------------------------------------------

async function applyICPSuggestion(
  orgId: string,
  payload: SuggestionPayload,
  originalMessage: string,
  log: ReturnType<typeof createEngineLogger>,
): Promise<{ applied: boolean; new_version: number | null }> {
  if (!payload.product_key) {
    return { applied: false, new_version: null };
  }

  // product_key is already normalised centrally in the main handler before this is called.

  // Prefer full icp_patch; fall back to single field/value
  let icpPatch: Record<string, unknown> | null = null;
  if (payload.icp_patch && Object.keys(payload.icp_patch).length > 0) {
    // Strip null entries
    icpPatch = Object.fromEntries(
      Object.entries(payload.icp_patch).filter(([, v]) => v != null)
    );
  } else if (payload.field && payload.value != null) {
    icpPatch = {
      [payload.field]: Array.isArray(payload.value) ? payload.value : [payload.value],
    };
  }

  if (!icpPatch || Object.keys(icpPatch).length === 0) {
    return { applied: false, new_version: null };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/mkt-evolve-icp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'manual_override',
        org_id: orgId,
        product_key: payload.product_key,
        icp_patch: icpPatch,
        reason: payload.reason || originalMessage,
        evolved_by: 'amit_suggestion',
      }),
    });

    if (res.ok) {
      const json = await res.json();
      return { applied: true, new_version: json?.new_version ?? null };
    }

    const errText = await res.text().catch(() => res.status.toString());
    await log.error('apply-icp-suggestion', new Error(`evolve-icp returned ${res.status}: ${errText}`));
    return { applied: false, new_version: null };
  } catch (err) {
    await log.error('apply-icp-suggestion', err instanceof Error ? err : new Error(String(err)));
    return { applied: false, new_version: null };
  }
}

// ---------------------------------------------------------------------------
// Regenerate Step Action
// ---------------------------------------------------------------------------

async function applyRegenerateStep(
  orgId: string,
  payload: SuggestionPayload,
  log: ReturnType<typeof createEngineLogger>,
): Promise<{ applied: boolean; step_name: string | null }> {
  if (!payload.product_key || !payload.step_name) {
    return { applied: false, step_name: null };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/mkt-product-manager`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'reset_step',
        org_id: orgId,
        product_key: payload.product_key,
        step_name: payload.step_name,
      }),
    });

    if (res.ok) {
      return { applied: true, step_name: payload.step_name };
    }

    const errText = await res.text();
    await log.error('apply-regenerate-step', new Error(`reset_step failed: ${errText}`));
    return { applied: false, step_name: null };
  } catch (err) {
    await log.error('apply-regenerate-step', err instanceof Error ? err : new Error(String(err)));
    return { applied: false, step_name: null };
  }
}

// ---------------------------------------------------------------------------
// Campaign Launch Action
// ---------------------------------------------------------------------------

async function applyLaunchCampaign(
  orgId: string,
  payload: SuggestionPayload,
  log: ReturnType<typeof createEngineLogger>,
): Promise<{ applied: boolean; enrolled: number; campaign_id: string | null }> {
  if (!payload.product_key) return { applied: false, enrolled: 0, campaign_id: null };

  const supabase = getSupabaseClient();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    // Find the campaign for this product
    const { data: campaign } = await supabase
      .from('mkt_campaigns')
      .select('id, status')
      .eq('org_id', orgId)
      .contains('metadata', { product_key: payload.product_key })
      .limit(1)
      .maybeSingle();

    if (!campaign) {
      await log.error('launch-campaign', new Error(`No campaign found for product_key=${payload.product_key}`));
      return { applied: false, enrolled: 0, campaign_id: null };
    }

    // Find eligible leads not already enrolled in this campaign
    const { data: alreadyEnrolled } = await supabase
      .from('mkt_sequence_enrollments')
      .select('lead_id')
      .eq('campaign_id', campaign.id);

    const enrolledLeadIds = (alreadyEnrolled || []).map((e: any) => e.lead_id);

    let leadsQuery = supabase
      .from('mkt_leads')
      .select('id')
      .eq('org_id', orgId)
      .not('status', 'in', '("unsubscribed","converted","disqualified")')
      .not('email', 'is', null)
      .limit(500);

    if (enrolledLeadIds.length > 0) {
      leadsQuery = leadsQuery.not('id', 'in', `(${enrolledLeadIds.map((id: string) => `"${id}"`).join(',')})`);
    }

    const { data: leads } = await leadsQuery;
    if (!leads || leads.length === 0) {
      return { applied: true, enrolled: 0, campaign_id: campaign.id };
    }

    const now = new Date().toISOString();
    const enrollments = leads.map((lead: any) => ({
      org_id: orgId,
      lead_id: lead.id,
      campaign_id: campaign.id,
      status: 'active',
      current_step: 1,
      next_action_at: now,
      enrolled_at: now,
    }));

    // Batch insert in chunks of 100
    for (let i = 0; i < enrollments.length; i += 100) {
      await supabase.from('mkt_sequence_enrollments').insert(enrollments.slice(i, i + 100));
    }

    // Update lead enrolled_at
    const leadIds = leads.map((l: any) => l.id);
    await supabase.from('mkt_leads').update({ enrolled_at: now }).in('id', leadIds);

    // Set campaign active
    await supabase.from('mkt_campaigns').update({ status: 'active' }).eq('id', campaign.id);

    // Trigger sequence executor
    fetch(`${supabaseUrl}/functions/v1/mkt-sequence-executor`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {});

    await log.info('campaign-launched', { product_key: payload.product_key, campaign_id: campaign.id, enrolled: leads.length });
    return { applied: true, enrolled: leads.length, campaign_id: campaign.id };
  } catch (err) {
    await log.error('launch-campaign', err instanceof Error ? err : new Error(String(err)));
    return { applied: false, enrolled: 0, campaign_id: null };
  }
}

// ---------------------------------------------------------------------------
// Campaign Pause / Resume Actions
// ---------------------------------------------------------------------------

async function applyCampaignPause(
  orgId: string,
  payload: SuggestionPayload,
  log: ReturnType<typeof createEngineLogger>,
): Promise<{ applied: boolean; paused: number }> {
  if (!payload.product_key) return { applied: false, paused: 0 };

  const supabase = getSupabaseClient();
  try {
    const { data: campaign } = await supabase
      .from('mkt_campaigns')
      .select('id')
      .eq('org_id', orgId)
      .contains('metadata', { product_key: payload.product_key })
      .limit(1)
      .maybeSingle();

    if (!campaign) return { applied: false, paused: 0 };

    const { count } = await supabase
      .from('mkt_sequence_enrollments')
      .update({ status: 'paused', cancel_reason: 'campaign_paused' })
      .eq('campaign_id', campaign.id)
      .eq('status', 'active')
      .select('*', { count: 'exact', head: true });

    await supabase.from('mkt_campaigns').update({ status: 'paused' }).eq('id', campaign.id);
    await log.info('campaign-paused', { product_key: payload.product_key, campaign_id: campaign.id });
    return { applied: true, paused: count ?? 0 };
  } catch (err) {
    await log.error('pause-campaign', err instanceof Error ? err : new Error(String(err)));
    return { applied: false, paused: 0 };
  }
}

async function applyCampaignResume(
  orgId: string,
  payload: SuggestionPayload,
  log: ReturnType<typeof createEngineLogger>,
): Promise<{ applied: boolean; resumed: number }> {
  if (!payload.product_key) return { applied: false, resumed: 0 };

  const supabase = getSupabaseClient();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    const { data: campaign } = await supabase
      .from('mkt_campaigns')
      .select('id')
      .eq('org_id', orgId)
      .contains('metadata', { product_key: payload.product_key })
      .limit(1)
      .maybeSingle();

    if (!campaign) return { applied: false, resumed: 0 };

    const { count } = await supabase
      .from('mkt_sequence_enrollments')
      .update({ status: 'active', cancel_reason: null, next_action_at: new Date().toISOString() })
      .eq('campaign_id', campaign.id)
      .eq('status', 'paused')
      .eq('cancel_reason', 'campaign_paused')
      .select('*', { count: 'exact', head: true });

    await supabase.from('mkt_campaigns').update({ status: 'active' }).eq('id', campaign.id);

    fetch(`${supabaseUrl}/functions/v1/mkt-sequence-executor`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {});

    await log.info('campaign-resumed', { product_key: payload.product_key, campaign_id: campaign.id });
    return { applied: true, resumed: count ?? 0 };
  } catch (err) {
    await log.error('resume-campaign', err instanceof Error ? err : new Error(String(err)));
    return { applied: false, resumed: 0 };
  }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = getSupabaseClient();
  const log = createEngineLogger('mkt-arohan-chat');

  try {
    const body: ChatBody = await req.json();
    const { org_id, thread_id, message } = body;

    if (!org_id || !thread_id || !message?.trim()) {
      return new Response(
        JSON.stringify({ error: 'org_id, thread_id, and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const trimmedMessage = message.trim();
    const start = Date.now();

    // Step 1: Classify message + load context in parallel
    // Pre-fetch last Arohan message for context-aware classification (e.g. "Yes" confirmations)
    const { data: lastArohanRows } = await supabase
      .from('mkt_arohan_conversations')
      .select('message')
      .eq('org_id', org_id)
      .eq('thread_id', thread_id)
      .eq('role', 'arohan')
      .order('created_at', { ascending: false })
      .limit(1);
    const lastArohanMessage = lastArohanRows?.[0]?.message as string | undefined;

    const [classification, context] = await Promise.all([
      classifySuggestion(trimmedMessage, lastArohanMessage),
      loadContext(supabase, org_id, thread_id),
    ]);

    // Step 2: Persist Amit's message
    const { data: amitRow, error: amitErr } = await supabase
      .from('mkt_arohan_conversations')
      .insert({
        org_id,
        thread_id,
        role: 'amit',
        message: trimmedMessage,
        is_suggestion: classification.is_suggestion,
        suggestion_payload: classification.suggestion_payload ?? null,
      })
      .select('id')
      .single();

    if (amitErr) {
      await log.error('persist-amit-message', new Error(amitErr.message), { org_id });
      return new Response(
        JSON.stringify({ error: 'Failed to persist message' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Step 3: Build conversation messages array for multi-turn Sonnet call
    const conversationMessages: ConversationMessage[] = context.threadHistory.map((msg) => ({
      role: msg.role === 'amit' ? 'user' : 'assistant',
      content: msg.message,
    }));
    conversationMessages.push({ role: 'user', content: trimmedMessage });

    // Step 4: Call Arohan (Sonnet, multi-turn)
    const systemPrompt = buildSystemPrompt(context);
    const arohanReply = await callArohan(conversationMessages, systemPrompt);

    // Step 5: Apply ICP suggestion if detected
    const actionsTriggered: Array<{ type: string; details: Record<string, unknown> }> = [];

    if (classification.is_suggestion && classification.suggestion_payload) {
      const sp = classification.suggestion_payload;

      // Normalise product_key centrally: lowercase + strip spaces/underscores/hyphens.
      // Classifier may return "vendor_verification" or "WorkSync" but DB keys are
      // compact lowercase strings like "vendorverification" / "worksync".
      if (sp.product_key) {
        sp.product_key = sp.product_key.toLowerCase().replace(/[\s_\-]+/g, '');
      }

      if (sp.type === 'icp_update') {
        const { applied, new_version } = await applyICPSuggestion(org_id, sp, trimmedMessage, log);
        if (applied) {
          actionsTriggered.push({
            type: 'icp_update',
            details: { product_key: sp.product_key, field: sp.field, new_version },
          });
        }
      } else if (sp.type === 'campaign_launch') {
        const { applied, enrolled, campaign_id } = await applyLaunchCampaign(org_id, sp, log);
        if (applied) {
          actionsTriggered.push({
            type: 'campaign_launch',
            details: { product_key: sp.product_key, campaign_id, enrolled },
          });
        }
      } else if (sp.type === 'campaign_pause') {
        const { applied, paused } = await applyCampaignPause(org_id, sp, log);
        if (applied) {
          actionsTriggered.push({
            type: 'campaign_pause',
            details: { product_key: sp.product_key, paused },
          });
        }
      } else if (sp.type === 'campaign_resume') {
        const { applied, resumed } = await applyCampaignResume(org_id, sp, log);
        if (applied) {
          actionsTriggered.push({
            type: 'campaign_resume',
            details: { product_key: sp.product_key, resumed },
          });
        }
      } else if (sp.type === 'regenerate_step') {
        const { applied, step_name } = await applyRegenerateStep(org_id, sp, log);
        if (applied) {
          actionsTriggered.push({
            type: 'regenerate_step',
            details: { product_key: sp.product_key, step_name },
          });
        }
      }

      if (actionsTriggered.length > 0 && amitRow?.id) {
        await supabase
          .from('mkt_arohan_conversations')
          .update({
            suggestion_applied: true,
            suggestion_applied_at: new Date().toISOString(),
          })
          .eq('id', amitRow.id);
      }
    }

    // Step 6: Persist Arohan's response
    const contextSnapshot = {
      products_count: context.products.length,
      icps_count: context.icps.length,
      campaigns_count: context.campaigns.length,
      tokens: { input: arohanReply.input_tokens, output: arohanReply.output_tokens },
    };

    await supabase.from('mkt_arohan_conversations').insert({
      org_id,
      thread_id,
      role: 'arohan',
      message: arohanReply.content,
      context_snapshot: contextSnapshot,
      actions_triggered: actionsTriggered,
    });

    const duration_ms = Date.now() - start;
    await log.info('chat-complete', {
      org_id,
      thread_id,
      is_suggestion: classification.is_suggestion,
      actions_triggered: actionsTriggered.length,
      duration_ms,
    }, {
      tokens_used: arohanReply.input_tokens + arohanReply.output_tokens,
      duration_ms,
    });

    return new Response(
      JSON.stringify({
        reply: arohanReply.content,
        is_suggestion: classification.is_suggestion,
        suggestion_payload: classification.suggestion_payload,
        actions_triggered: actionsTriggered,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    await log.error('chat-error', err instanceof Error ? err : new Error(String(err)));
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
