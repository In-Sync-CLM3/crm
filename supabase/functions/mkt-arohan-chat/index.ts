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
  type: 'icp_update' | 'campaign_launch' | 'campaign_pause' | 'campaign_resume' | 'regenerate_step' | 'linkedin_post_now' | 'tech_request' | 'none';
  product_key?: string;
  step_name?: string;
  field?: string;
  value?: unknown;
  icp_patch?: Record<string, unknown>;
  reason?: string;
  // tech_request fields
  title?: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
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

async function callArohanGroq(
  messages: ConversationMessage[],
  systemPrompt: string,
): Promise<{ content: string; input_tokens: number; output_tokens: number }> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('Missing GROQ_API_KEY for Groq fallback');

  const groqMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: groqMessages,
      max_tokens: 1024,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq fallback error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    input_tokens: data.usage?.prompt_tokens || 0,
    output_tokens: data.usage?.completion_tokens || 0,
  };
}

async function callArohan(
  messages: ConversationMessage[],
  systemPrompt: string,
): Promise<{ content: string; input_tokens: number; output_tokens: number }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return callArohanGroq(messages, systemPrompt);

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

        // Credit exhausted — fall back to Groq immediately
        if (response.status === 400 && errorBody.includes('credit balance is too low')) {
          return callArohanGroq(messages, systemPrompt);
        }

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
  const today = new Date().toISOString().split('T')[0];

  const [productsRes, icpsRes, campaignsRes, analyticsRes, enrollmentStatsRes, todaySendsRes, contactFunnelRes, pendingRes, historyRes, waTemplatesRes, linkedinRes, recentBlogsRes, liveLogRes] = await Promise.all([
    supabase
      .from('mkt_products')
      .select('product_key, product_name, active, onboarding_status, product_url, schema_map, trial_days')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),

    supabase.rpc('get_all_current_icps', { _org_id: orgId }),

    supabase
      .from('mkt_campaigns')
      .select('id, name, product_key, status, channel, sequence_priority')
      .eq('org_id', orgId)
      .order('sequence_priority', { ascending: true, nullsFirst: false }),

    supabase.rpc('get_all_campaigns_analytics', { p_org_id: orgId }),

    // Enrollment counts by campaign and status
    supabase
      .from('mkt_sequence_enrollments')
      .select('campaign_id, status')
      .eq('org_id', orgId),

    // Today's sends by channel
    supabase
      .from('mkt_sequence_actions')
      .select('campaign_id, channel, status')
      .eq('org_id', orgId)
      .gte('created_at', `${today}T00:00:00Z`),

    // Contact funnel counts
    supabase
      .from('contacts')
      .select('status')
      .eq('org_id', orgId),

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

    // LinkedIn blog engine state
    supabase
      .from('mkt_linkedin_config')
      .select('start_date, experiment_complete, winning_slot, last_posted_date, last_posted_slot_index, last_posted_product_key, experiment_slots, active')
      .eq('org_id', orgId)
      .eq('active', true)
      .maybeSingle(),

    // 5 most recent LinkedIn posts with engagement
    supabase
      .from('blog_posts')
      .select('blog_title, product_key, publish_date, linkedin_slot_index, linkedin_cycle, linkedin_likes, linkedin_comments, linkedin_reposts, linkedin_engagement_score')
      .eq('org_id', orgId)
      .not('linkedin_post_urn', 'is', null)
      .order('publish_date', { ascending: false })
      .limit(5),

    // Currently live campaign from executor logs
    supabase
      .from('mkt_engine_logs')
      .select('details')
      .eq('function_name', 'mkt-sequence-executor')
      .eq('action', 'executor-start')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
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

  // Build enrollment stats map: campaign_id → { active, paused, completed, total }
  const enrollmentMap = new Map<string, Record<string, number>>();
  for (const row of (enrollmentStatsRes.data || []) as Array<{ campaign_id: string; status: string }>) {
    if (!enrollmentMap.has(row.campaign_id)) enrollmentMap.set(row.campaign_id, {});
    const m = enrollmentMap.get(row.campaign_id)!;
    m[row.status] = (m[row.status] || 0) + 1;
    m['total'] = (m['total'] || 0) + 1;
  }

  // Build today's sends map: campaign_id → { sent, delivered, bounced, ... }
  const todaySendsMap = new Map<string, Record<string, number>>();
  for (const row of (todaySendsRes.data || []) as Array<{ campaign_id: string; channel: string; status: string }>) {
    if (!todaySendsMap.has(row.campaign_id)) todaySendsMap.set(row.campaign_id, {});
    const m = todaySendsMap.get(row.campaign_id)!;
    m[row.status] = (m[row.status] || 0) + 1;
    m['total'] = (m['total'] || 0) + 1;
  }

  // Contact funnel counts
  const funnelCounts: Record<string, number> = {};
  for (const row of (contactFunnelRes.data || []) as Array<{ status: string }>) {
    const s = row.status || 'unknown';
    funnelCounts[s] = (funnelCounts[s] || 0) + 1;
  }

  // Analytics keyed by campaign_id
  const analyticsMap = new Map<string, Record<string, unknown>>();
  for (const row of (analyticsRes.data || []) as Array<Record<string, unknown>>) {
    analyticsMap.set(row.campaign_id as string, row);
  }

  const liveCampaignId = (liveLogRes.data?.details as Record<string, unknown> | null)?.active_campaign as string | undefined;

  return {
    products,
    icps: (icpsRes.data || []) as ICPRow[],
    campaigns: campaignsRes.data || [],
    analyticsMap,
    enrollmentMap,
    todaySendsMap,
    funnelCounts,
    liveCampaignId,
    pendingSuggestions: pendingRes.data || [],
    threadHistory: (historyRes.data || []) as Array<{ role: string; message: string }>,
    waTemplates: (waTemplatesRes.data || []) as Array<{ name: string; template_name: string; approval_status: string; submission_error: string | null }>,
    landingPages,
    linkedinConfig: linkedinRes.data ?? null,
    recentBlogs: (recentBlogsRes.data || []) as Array<{
      blog_title: string; product_key: string | null; publish_date: string;
      linkedin_slot_index: number | null; linkedin_cycle: number | null;
      linkedin_likes: number; linkedin_comments: number; linkedin_reposts: number;
      linkedin_engagement_score: number | null;
    }>,
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
    "type": "icp_update" | "campaign_launch" | "campaign_pause" | "campaign_resume" | "regenerate_step" | "linkedin_post_now" | "tech_request" | "none",
    "product_key": "string or null",
    "step_name": "whatsapp_templates | email_templates | call_scripts | icp_infer | campaign_create | source_leads | null",
    "field": "industries | company_sizes | designations | geographies | languages | pain_points | null",
    "value": ["array", "of", "values"] | null,
    "icp_patch": {
      "industries": [...] | null,
      "designations": [...] | null,
      "company_sizes": [...] | null,
      "geographies": [...] | null,
      "pain_points": [...] | null,
      "confidence_score": 0.0-1.0 number | null
    } | null,
    "reason": "brief reason string or null",
    "title": "short title for tech_request or null",
    "description": "full description for tech_request or null",
    "priority": "high | medium | low | null"
  } | null
}

Type guide:
- "icp_update": user wants to change ICP targeting. If the previous Arohan message contains a "PROPOSED ICP UPDATE" block, extract ALL fields from that block into icp_patch. If it's a single-field change, use field/value. For confidence: "50%" or "v2 / 50%" → confidence_score: 0.5; "70%" → 0.7; etc. IMPORTANT: short confirmations like "Yes", "Go ahead", "Do it", "Sure" from the user ALWAYS mean they are confirming the PROPOSED ICP UPDATE in the previous Arohan message — classify these as icp_update and extract the full icp_patch from that block.
- "campaign_launch": user wants to launch/start/activate/run a campaign for a product
- "campaign_pause": user wants to pause/stop a campaign
- "campaign_resume": user wants to resume/restart a paused campaign
- "regenerate_step": user wants to regenerate/redo/recreate a step output
  → set step_name to: whatsapp_templates, email_templates, call_scripts, icp_infer, campaign_create, source_leads
  → set product_key if mentioned
- "linkedin_post_now": user wants to immediately post a LinkedIn article for a product (bypasses the scheduled slot)
  → set product_key to the product they mentioned (or null to use next in rotation)
- "tech_request": Arohan itself has identified a code/config/infrastructure change that needs Claude Code to implement
  → Only classify as this when YOU (Arohan) are proposing a technical change that requires engineering work
  → set title (short, e.g. "Add reply-tracking to executor"), description (full details of what needs to change and why), priority (high/medium/low)
  → This is NOT for user requests — only when Arohan proactively surfaces a technical improvement
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

function buildLinkedInSection(context: Awaited<ReturnType<typeof loadContext>>): string {
  const cfg = context.linkedinConfig;
  if (!cfg) return '## LinkedIn Blog Engine\nNot configured.';

  const slots = cfg.experiment_slots as string[];
  const start = new Date(cfg.start_date);
  const today = new Date();
  const daysSinceStart = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000));
  const cycleDay = (daysSinceStart % 9) + 1;
  const currentCycle = Math.floor(daysSinceStart / 9) + 1;
  const todaySlot = cfg.experiment_complete && cfg.winning_slot
    ? cfg.winning_slot
    : slots[daysSinceStart % 9];

  const blogLines = context.recentBlogs.length
    ? context.recentBlogs.map((b) =>
        `• [${b.publish_date}] ${b.blog_title} (${b.product_key ?? '?'}) — ` +
        `slot ${b.linkedin_slot_index ?? '?'} cycle ${b.linkedin_cycle ?? '?'} | ` +
        `👍${b.linkedin_likes} 💬${b.linkedin_comments} 🔁${b.linkedin_reposts} score=${b.linkedin_engagement_score ?? 0}`
      ).join('\n')
    : 'No posts yet.';

  const experimentStatus = cfg.experiment_complete
    ? `COMPLETE — winning slot: ${cfg.winning_slot} IST (locked in permanently)`
    : `IN PROGRESS — Day ${daysSinceStart + 1}/27 (Cycle ${currentCycle}/3, day ${cycleDay}/9 within cycle) | Today's slot: ${todaySlot} IST`;

  return `## LinkedIn Blog Engine (Arohan Channel)
Experiment: ${experimentStatus}
Last posted: ${cfg.last_posted_date ?? 'never'} | Product: ${cfg.last_posted_product_key ?? 'n/a'}

Recent Posts & Engagement:
${blogLines}

You can trigger an immediate post for any product: just tell Amit "I'll post for [product] now" and classify as linkedin_post_now.`;
}

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
    ? context.campaigns.map((c: Record<string, unknown>) => {
        const cid = c.id as string;
        const a = context.analyticsMap.get(cid) as Record<string, unknown> | undefined;
        const e = context.enrollmentMap.get(cid) || {};
        const t = context.todaySendsMap.get(cid) || {};
        const isLive = cid === context.liveCampaignId;
        const sent    = (a?.sent    as number ?? 0);
        const delivered = (a?.delivered as number ?? 0);
        const opened  = (a?.opened  as number ?? 0);
        const replied = (a?.replied as number ?? 0);
        const bounced = (a?.bounced as number ?? 0);
        const converted = (a?.converted as number ?? 0);
        const enrolled  = (a?.enrolled  as number ?? 0);
        const openRate  = sent > 0 ? `${Math.round(opened / sent * 100)}%` : '—';
        const delivRate = sent > 0 ? `${Math.round(delivered / sent * 100)}%` : '—';
        const todayCount = t['total'] || 0;
        const liveTag = isLive ? ' 🟢 LIVE NOW' : '';
        return [
          `• ${c.name as string} [${c.channel as string || 'unknown'}, ${c.status as string}]${liveTag}`,
          `  Enrolled: ${enrolled.toLocaleString()} | Active: ${e['active'] || 0} | Completed: ${e['completed'] || 0}`,
          `  All-time: ${sent.toLocaleString()} sent → ${delivRate} delivered → ${openRate} opened → ${replied} replied → ${converted} converted`,
          `  Bounced: ${bounced} | Today's sends: ${todayCount}`,
        ].join('\n');
      }).join('\n\n')
    : 'No campaigns found.';

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

## Contact Funnel (all contacts in database)
${Object.entries(context.funnelCounts).map(([s, n]) => `• ${s}: ${(n as number).toLocaleString()}`).join('\n') || 'No contacts yet.'}
Total: ${Object.values(context.funnelCounts).reduce((a, b) => (a as number) + (b as number), 0).toLocaleString()} contacts

## Active Campaigns
${campaignLines}

## WhatsApp Templates
${waLines}

## Pending Suggestions (not yet applied)
${pendingLines}

${buildLinkedInSection(context)}

## Actions you can take
- Update an ICP field (industries, designations, company_sizes, geographies, pain_points)
- Launch a campaign: enroll all eligible leads and start sending immediately
- Pause a campaign: halt all active enrollments
- Resume a campaign: restart paused enrollments
- Regenerate a step: whatsapp_templates, email_templates, call_scripts, icp_infer, campaign_create, source_leads
  → When Amit asks to redo/recreate/regenerate any of these, you will trigger it automatically.
- Post to LinkedIn now for a product: classify as linkedin_post_now with the product_key
  → Bypasses the scheduled time — useful for manual overrides or testing
- Log a tech request for Claude Code: classify as tech_request with title, description, priority
  → Use this when you identify a code/config/infrastructure improvement that requires engineering work
  → Claude Code reads this table at the start of every session and picks up pending items
  → Say: "I've logged a tech request for Claude Code: [title]" and a green badge will confirm it was saved
  → Examples: new feature needed, bug in the engine, config that should be dynamic, missing data feed

## CRITICAL: How your actions work
- You ARE wired to the database. When Amit confirms a change, the system executes it automatically — a green badge appears in the UI confirming it ran.
- NEVER say you "can't write to the database" or "don't have write capability" — you do.
- When Amit confirms a change, say: "Requesting the update now — a green badge will confirm when it's applied."
- If no badge appears after confirmation, say: "The action may not have triggered — please try rephrasing your request."
- Do NOT pre-emptively tell Amit to ask his tech team. You are the system.

## CRITICAL: ICP update format
When proposing an ICP update, you MUST end your message with a structured block so the system can apply it automatically. Use EXACTLY this format:

PROPOSED ICP UPDATE — <product_key>
- industries: [value1, value2, ...]
- designations: [value1, value2, ...]
- company_sizes: [value1, value2, ...]
- geographies: [value1, value2, ...]
- pain_points: [value1, value2, ...]

Only include fields you are actually changing. Then say: "Reply 'Go ahead' to apply this."
When Amit says 'Yes', 'Go ahead', 'Do it', or similar — that is a confirmation of the PROPOSED ICP UPDATE above. Apply it immediately.`;
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
  let confidenceScore: number | undefined;

  if (payload.icp_patch && Object.keys(payload.icp_patch).length > 0) {
    // Extract confidence_score separately (it's not part of ICPFields in evolve-icp)
    const { confidence_score: cs, ...fieldPatch } = payload.icp_patch as Record<string, unknown>;
    if (typeof cs === 'number' && cs >= 0 && cs <= 1) {
      confidenceScore = cs;
    }
    // Strip null entries
    icpPatch = Object.fromEntries(
      Object.entries(fieldPatch).filter(([, v]) => v != null)
    );
  } else if (payload.field && payload.value != null) {
    icpPatch = {
      [payload.field]: Array.isArray(payload.value) ? payload.value : [payload.value],
    };
  }

  // Allow confidence-only updates (no other field changes needed)
  if ((!icpPatch || Object.keys(icpPatch).length === 0) && confidenceScore === undefined) {
    return { applied: false, new_version: null };
  }
  if (!icpPatch) icpPatch = {};

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
        ...(confidenceScore !== undefined ? { confidence_score: confidenceScore } : {}),
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
      .eq('product_key', payload.product_key)
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
      .from('contacts')
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

    // Mark contacts as enrolled
    const leadIds = leads.map((l: any) => l.id);
    await supabase.from('contacts').update({ status: 'enrolled', updated_at: now }).in('id', leadIds)
      .in('status', ['new', 'enriched', 'scored']);

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
      .eq('product_key', payload.product_key)
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
      .eq('product_key', payload.product_key)
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
// Tech Request Action
// ---------------------------------------------------------------------------

async function applyTechRequest(
  orgId: string,
  threadId: string,
  payload: SuggestionPayload,
  log: ReturnType<typeof createEngineLogger>,
): Promise<{ applied: boolean }> {
  if (!payload.title || !payload.description) return { applied: false };

  const supabase = getSupabaseClient();
  try {
    const { error } = await supabase.from('mkt_tech_requests').insert({
      org_id:      orgId,
      title:       payload.title,
      description: payload.description,
      priority:    payload.priority ?? 'medium',
      status:      'pending',
      thread_id:   threadId,
      context:     { reason: payload.reason ?? null },
      requested_by: 'arohan',
    });
    if (error) throw new Error(error.message);
    await log.info('tech-request-logged', { org_id: orgId, title: payload.title, priority: payload.priority });
    return { applied: true };
  } catch (err) {
    await log.error('tech-request-failed', err instanceof Error ? err : new Error(String(err)));
    return { applied: false };
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

      // Normalise product_key centrally: lowercase, spaces/underscores → hyphens.
      // DB keys are created by deriveProductKey() which produces "global-crm" style
      // (hyphens for spaces, no underscores). Stripping hyphens was wrong and caused
      // "global-crm" to become "globalcrm" which never matched in the DB.
      if (sp.product_key) {
        sp.product_key = sp.product_key.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9\-]/g, '');
      }

      if (sp.type === 'icp_update') {
        // Fallback: extract product_key from "PROPOSED ICP UPDATE — <product_key>" in last Arohan message
        if (!sp.product_key && lastArohanMessage) {
          const pkMatch = lastArohanMessage.match(/PROPOSED ICP UPDATE\s*[—\-]+\s*([a-z0-9][a-z0-9\-\s_]*)/i);
          if (pkMatch) {
            sp.product_key = pkMatch[1].trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9\-]/g, '');
          }
        }
        const { applied, new_version } = await applyICPSuggestion(org_id, sp, trimmedMessage, log);
        if (applied) {
          actionsTriggered.push({
            type: 'icp_update',
            details: { product_key: sp.product_key, field: sp.field, new_version, confidence_score: (sp.icp_patch as Record<string, unknown>)?.confidence_score },
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
      } else if (sp.type === 'tech_request') {
        const { applied } = await applyTechRequest(org_id, thread_id, sp, log);
        if (applied) {
          actionsTriggered.push({
            type: 'tech_request',
            details: { title: sp.title, priority: sp.priority ?? 'medium' },
          });
        }
      } else if (sp.type === 'linkedin_post_now') {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        fetch(`${supabaseUrl}/functions/v1/mkt-blog-writer`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true, product_key: sp.product_key ?? null }),
        }).catch(() => {});
        actionsTriggered.push({
          type: 'linkedin_post_now',
          details: { product_key: sp.product_key ?? 'next in rotation' },
        });
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
