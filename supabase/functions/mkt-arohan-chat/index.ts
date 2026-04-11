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
  type: 'icp_update' | 'campaign_pause' | 'campaign_resume' | 'regenerate_step' | 'none';
  product_key?: string;
  step_name?: string;
  field?: string;
  value?: unknown;
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
      .select('product_key, product_name, active, onboarding_status')
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

  return {
    products: productsRes.data || [],
    icps: (icpsRes.data || []) as ICPRow[],
    campaigns: campaignsRes.data || [],
    pendingSuggestions: pendingRes.data || [],
    threadHistory: (historyRes.data || []) as Array<{ role: string; message: string }>,
    waTemplates: (waTemplatesRes.data || []) as Array<{ name: string; template_name: string; approval_status: string; submission_error: string | null }>,
  };
}

// ---------------------------------------------------------------------------
// Suggestion Classifier (Haiku — cheap, fast)
// ---------------------------------------------------------------------------

async function classifySuggestion(message: string): Promise<SuggestionClassification> {
  const prompt = `You are classifying a message from a business founder to their AI revenue engine called Arohan.

Message: "${message}"

Is this message an actionable suggestion?

Return JSON only:
{
  "is_suggestion": true | false,
  "suggestion_payload": {
    "type": "icp_update" | "campaign_pause" | "campaign_resume" | "regenerate_step" | "none",
    "product_key": "string or null",
    "step_name": "whatsapp_templates | email_templates | call_scripts | icp_infer | campaign_create | source_leads | null",
    "field": "industries | company_sizes | designations | geographies | languages | pain_points | null",
    "value": ["array", "of", "values"] | null,
    "reason": "brief reason string or null"
  } | null
}

Type guide:
- "icp_update": user wants to change ICP targeting (industries, designations, etc.)
- "campaign_pause": user wants to pause a campaign
- "campaign_resume": user wants to resume a campaign
- "regenerate_step": user wants to regenerate/redo/recreate a step output (templates, ICP, scripts, leads, campaign)
  → set step_name to the matching step: whatsapp_templates, email_templates, call_scripts, icp_infer, campaign_create, source_leads
  → set product_key if mentioned
- "none": informational question or general conversation

If not a suggestion, set is_suggestion to false and suggestion_payload to null.`;

  try {
    const { data } = await callLLMJson<SuggestionClassification>(prompt, {
      model: 'haiku',
      max_tokens: 300,
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

  return `You are Arohan — the autonomous revenue engine for In-Sync. You are a strategic AI advisor helping Amit (the founder/operator) understand performance, refine targeting strategy, and make data-driven decisions.

## Identity
- Arohan means "ascent" — always moving the business upward
- You manage 5 revenue loops: acquisition → activation → retention → expansion → referral
- Channels unlock by milestone: M3=Vapi calling, M4=Google Ads + Global Persona Intelligence, M5=Meta Ads, M6=LinkedIn
- You are direct, data-driven, and proactively surface insights

## Persona
- Speak in clear business language — no tech jargon
- Be honest about uncertainty; never invent data
- When Amit makes an ICP suggestion, evaluate it critically and say whether you will apply it
- When applying a suggestion, state: "Applying this to [product_key] ICP now."
- Keep responses focused: 2–4 short paragraphs or a tight bullet list

## Current Date
${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}

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
- Pause or resume a campaign
- Regenerate a step: whatsapp_templates, email_templates, call_scripts, icp_infer, campaign_create, source_leads
  → When Amit asks to redo/recreate/regenerate any of these, you will trigger it automatically.`;
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
  if (
    !payload.product_key ||
    !payload.field ||
    !payload.value
  ) {
    return { applied: false, new_version: null };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const icpPatch: Record<string, unknown> = {
    [payload.field]: Array.isArray(payload.value) ? payload.value : [payload.value],
  };

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

    await res.body?.cancel();
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
    const [classification, context] = await Promise.all([
      classifySuggestion(trimmedMessage),
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

      if (sp.type === 'icp_update') {
        const { applied, new_version } = await applyICPSuggestion(org_id, sp, trimmedMessage, log);
        if (applied) {
          actionsTriggered.push({
            type: 'icp_update',
            details: { product_key: sp.product_key, field: sp.field, new_version },
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
