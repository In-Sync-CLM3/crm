import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { getMemory, buildContextString } from '../_shared/conversationMemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Two Vapi assistant sets for A/B voice testing
// Voice A = Nimmo (zELrJnEGQSGWhiTNcUKq) | Voice B = 6BZyx2XekeeXOkTVn8un
// Assignment is deterministic per lead_id so the same contact always hears the same voice.
// Phone number ID: d360ac85 = +911169323462 routed via kamailio relay → Exotel
const VAPI_PHONE_NUMBER_ID = 'c6bb4e94-525b-4455-929d-f4a9e8cfb6dc';

const VAPI_ASSISTANTS_A: Record<string, string> = {
  'email':              'e20e2c33-77ea-4dc0-a092-c24f7c938f25',
  'event':              'dce357bf-a6fb-4f36-8c97-f8fe8295c482',
  'fieldsync':          'bcfad0ab-b284-4f6c-8e99-c29878fa8ddb',
  'globalcrm':          '46aa0813-9be9-4b80-941d-0f9c1b5fda9a',
  'in-sync':            '0f63972c-1caf-4993-9716-4ee5f990389e',
  'vendorverification': '8a00f5f2-5276-4a7d-aaf9-6ad951619981',
  'whatsapp':           '5e84c766-1999-4523-a681-f3887b9888bc',
  'worksync':           '9306a25f-7bc0-4910-af64-d58de575f757',
};

const VAPI_ASSISTANTS_B: Record<string, string> = {
  'email':              '5e1a94a5-798f-4c01-9ec5-859bb65de1bc',
  'event':              'e59f6e6d-8f38-4fff-a274-db89797db227',
  'fieldsync':          'e8f9fe76-c249-476b-bfdc-569fbd7865c1',
  'globalcrm':          'e84072d5-b1f6-4db6-817a-ccbdaa4cd354',
  'in-sync':            '2f1e0c01-9a07-468e-9099-4c87d2548906',
  'vendorverification': '2496aec0-4ebb-4ab6-b318-964d4a4c5c45',
  'whatsapp':           'f809c1a4-6182-47bf-9e73-d700500b7ff3',
  'worksync':           '558aa3aa-f8a7-4b7f-b4bb-66366262132a',
};

/**
 * Deterministically assign voice variant A or B based on lead_id.
 * The UUID's first 8 hex chars are parsed as a number; even = A, odd = B.
 * This is stable: the same lead_id always resolves to the same variant.
 */
function resolveVoiceVariant(leadId: string): 'A' | 'B' {
  const hex = leadId.replace(/-/g, '').substring(0, 8);
  return parseInt(hex, 16) % 2 === 0 ? 'A' : 'B';
}

interface InitiateCallRequest {
  action_id: string;
  enrollment_id: string;
  lead_id: string;
  step_id: string;
  template_id?: string; // Direct mkt_call_scripts ID (legacy fallback)
  call_type?: string;   // Used with lead.product_key for DB lookup
  channel: string;
}

interface ConversationContext {
  timeline: Array<{ channel: string; direction: string; summary: string; timestamp: string }>;
  key_facts: string[];
  objections: string[];
  interests: string[];
  next_steps: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-initiate-call');

  try {
    const supabase = getSupabaseClient();

    const body: InitiateCallRequest = await req.json();
    const { action_id, enrollment_id, lead_id, template_id, call_type } = body;

    const vapiApiKey = Deno.env.get('VAPI_API_KEY');
    if (!vapiApiKey) throw new Error('Missing VAPI_API_KEY environment variable');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // Fetch lead — try contacts first, then mkt_leads for backward compat
    let lead: Record<string, unknown> | null = null;
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', lead_id)
      .single();
    lead = contact;

    if (!lead) {
      const { data: mktLead } = await supabase
        .from('mkt_leads')
        .select('*')
        .eq('id', lead_id)
        .single();
      lead = mktLead;
    }

    if (!lead) throw new Error(`Lead not found: ${lead_id}`);
    if (!lead.phone) throw new Error(`Lead ${lead_id} has no phone number`);

    const orgId = lead.org_id as string;
    const productKey = (lead.product_key as string) || '';

    // -------------------------------------------------------------------------
    // Fetch call script — best match by org + product + call_type + persona
    // -------------------------------------------------------------------------
    let script: Record<string, unknown> | null = null;

    if (productKey && call_type) {
      // Build query scoped to org
      let q = supabase
        .from('mkt_call_scripts')
        .select('*')
        .eq('org_id', orgId)
        .eq('product_key', productKey)
        .eq('call_type', call_type)
        .eq('is_active', true);

      // For persona-specific scripts, try job_title match in name
      const jobTitle = (lead.job_title as string) || '';
      const personaKey = derivePersonaKey(jobTitle);
      if (personaKey) {
        const { data: personaScript } = await (q as unknown as typeof q & { ilike: (col: string, pat: string) => typeof q })
          .ilike('name', `%${personaKey}%`)
          .limit(1);
        // @ts-ignore
        script = personaScript?.[0] ?? null;
      }

      // Fallback: any script for this product + call_type (org-scoped)
      if (!script) {
        const { data: anyScript } = await q.limit(1);
        script = anyScript?.[0] ?? null;
      }

      // Final fallback: any org (for products not yet org-specific)
      if (!script) {
        const { data: globalScript } = await supabase
          .from('mkt_call_scripts')
          .select('*')
          .eq('product_key', productKey)
          .eq('call_type', call_type)
          .eq('is_active', true)
          .limit(1);
        script = globalScript?.[0] ?? null;
      }
    }

    // Direct template_id lookup (legacy / explicit)
    if (!script && template_id) {
      const { data } = await supabase
        .from('mkt_call_scripts')
        .select('*')
        .eq('id', template_id)
        .single();
      script = data;
    }

    if (!script) {
      const desc = productKey && call_type ? `${productKey}/${call_type}` : `template_id ${template_id ?? '(none)'}`;
      throw new Error(`No call script found for ${desc}`);
    }

    // Resolve Vapi assistant ID — prefer script-level override, then A/B product map
    const voiceVariant = resolveVoiceVariant(lead_id);
    const assistantMap = voiceVariant === 'A' ? VAPI_ASSISTANTS_A : VAPI_ASSISTANTS_B;
    const assistantId: string | undefined =
      (script.vapi_assistant_id as string | undefined) || assistantMap[productKey];

    if (!assistantId) {
      throw new Error(`No Vapi assistant configured for product "${productKey}". Add it to VAPI_ASSISTANTS.`);
    }

    // -------------------------------------------------------------------------
    // Load conversation memory & product details
    // -------------------------------------------------------------------------
    const memory = await getMemory(lead_id);

    let product: Record<string, unknown> | null = null;
    if (productKey) {
      const { data } = await supabase
        .from('mkt_products')
        .select('product_name, product_key, product_url, payment_url')
        .eq('product_key', productKey)
        .single();
      product = data;
    }

    // -------------------------------------------------------------------------
    // Format phone to E.164
    // -------------------------------------------------------------------------
    let phone = (lead.phone as string).replace(/[^\d+]/g, '');
    if (!phone.startsWith('+')) {
      if (!phone.startsWith('91') && phone.length === 10) phone = '+91' + phone;
      else phone = '+' + phone;
    }

    // -------------------------------------------------------------------------
    // Build dynamic system prompt and first message
    // -------------------------------------------------------------------------
    const systemPrompt = buildSystemPrompt(script, memory, product, lead);
    const firstMessage = buildFirstMessage(script, memory, lead);

    // -------------------------------------------------------------------------
    // Initiate Vapi outbound phone call directly via Exotel relay
    // -------------------------------------------------------------------------
    const vapiCallRes = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        customer: { number: phone },
        assistantId,
        assistantOverrides: {
          model: {
            provider: 'openai',
            model: 'gpt-4o',
            systemPrompt,
          },
          firstMessage,
          maxDurationSeconds: (script.max_duration_seconds as number) || 300,
        },
        metadata: {
          action_id,
          enrollment_id,
          lead_id,
          org_id: orgId,
        },
        serverUrl: `${supabaseUrl}/functions/v1/mkt-vapi-webhook`,
      }),
    });

    if (!vapiCallRes.ok) {
      const errText = await vapiCallRes.text();
      throw new Error(`Vapi call error ${vapiCallRes.status}: ${errText}`);
    }

    const vapiResult = await vapiCallRes.json();
    const callId = vapiResult.id as string;

    // Update action record
    await supabase
      .from('mkt_sequence_actions')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        external_id: callId,
        metadata: {
          phone,
          script_name: script.name,
          vapi_call_id: callId,
          assistant_id: assistantId,
          voice_variant: voiceVariant,
          max_duration: script.max_duration_seconds,
        },
      })
      .eq('id', action_id);

    // Deduct wallet cost for call initiation
    await supabase.rpc('deduct_from_wallet', {
      _org_id: orgId,
      _amount: 2.00,
      _service_type: 'ai_call',
      _reference_id: action_id,
      _quantity: 1,
      _unit_cost: 2.00,
      _user_id: null,
    }).catch((err: Error) => {
      console.warn('[mkt-initiate-call] Wallet deduction failed:', err.message);
    });

    await logger.info('call-initiated', {
      lead_id,
      action_id,
      vapi_call_id: callId,
      assistant_id: assistantId,
      voice_variant: voiceVariant,
      phone,
      product_key: productKey,
    });

    return new Response(
      JSON.stringify({ success: true, action_id, call_id: callId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    await logger.error('initiate-call-failed', error);

    try {
      const { action_id } = await req.clone().json();
      if (action_id) {
        const supabase = getSupabaseClient();
        await supabase
          .from('mkt_sequence_actions')
          .update({
            status: 'failed',
            failed_at: new Date().toISOString(),
            failure_reason: error instanceof Error ? error.message : String(error),
          })
          .eq('id', action_id);
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ---------------------------------------------------------------------------
// Persona key extraction — maps common job titles to script name fragments
// ---------------------------------------------------------------------------
function derivePersonaKey(jobTitle: string): string {
  const jt = jobTitle.toLowerCase();
  if (jt.includes('cfo') || jt.includes('chief financial') || jt.includes('finance director')) return 'CFO';
  if (jt.includes('coo') || jt.includes('chief operating') || jt.includes('operations director')) return 'COO';
  if (jt.includes('cto') || jt.includes('chief tech') || jt.includes('tech lead') || jt.includes('vp engineering')) return 'CTO';
  if (jt.includes('cco') || jt.includes('chief customer') || jt.includes('customer success')) return 'CCO';
  if (jt.includes('procurement') || jt.includes('purchasing') || jt.includes('vendor manager')) return 'Procurement';
  if (jt.includes('supply chain') || jt.includes('logistics')) return 'Supply Chain';
  return '';
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------
function buildSystemPrompt(
  script: Record<string, unknown>,
  memory: ConversationContext,
  product: Record<string, unknown> | null,
  lead: Record<string, unknown>,
): string {
  const keyPoints = parseJsonField<string[]>(script.key_points, []);
  const objections = parseJsonField<Record<string, string>>(script.objection_handling, {});
  const productName = product?.product_name || 'our product';

  let prompt = `You are Arohan, a professional AI sales assistant with a warm Indian female voice.
You represent ${productName}.

CALL TYPE: ${script.call_type || 'outreach'}
CALL OBJECTIVE: ${script.objective || 'Engage the prospect and move toward next steps'}

LEAD INFO:
- Name: ${lead.first_name || 'there'} ${lead.last_name || ''}
- Company: ${lead.company || 'N/A'}
- Title: ${lead.job_title || 'N/A'}
- Industry: ${lead.industry || 'N/A'}`;

  const contextString = buildContextString(memory);
  if (contextString && contextString !== 'No prior conversation history.') {
    prompt += `\n\nCONVERSATION HISTORY:\n${contextString}`;
  }

  if (memory.objections.length > 0) {
    prompt += `\n\nACTIVE OBJECTION TO ADDRESS: ${memory.objections[memory.objections.length - 1]}`;
  }

  if (memory.interests.length > 0) {
    prompt += `\n\nLEAD IS INTERESTED IN: ${memory.interests.join('; ')}`;
  }

  if (product?.payment_url) {
    prompt += `\n\nPAYMENT URL (share if they are ready to sign up): ${product.payment_url}`;
  }

  if (keyPoints.length > 0) {
    prompt += `\n\nKEY TALKING POINTS:\n${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
  }

  if (Object.keys(objections).length > 0) {
    prompt += `\n\nOBJECTION HANDLING:\n${Object.entries(objections).map(([obj, resp]) => `- "${obj}": ${resp}`).join('\n')}`;
  }

  prompt += `\n\nCLOSING GOAL: ${script.closing || 'Thank you for your time.'}

RULES:
- Keep each response to 2-3 sentences. Be conversational, not scripted.
- Speak naturally — do not read the script word for word.
- If they are not interested, be respectful and end the call gracefully.
- If they ask to be removed from the list, acknowledge and end the call immediately.
- Never be pushy or aggressive. Mirror their energy and pace.
- If asked who you are: say you are Arohan, an AI assistant from the ${productName} team.
- Always end with a clear next step: demo booking, email follow-up, or a callback time.`;

  return prompt;
}

function buildFirstMessage(
  script: Record<string, unknown>,
  memory: ConversationContext,
  lead: Record<string, unknown>,
): string {
  const firstName = (lead.first_name as string) || 'there';
  const baseOpening = (script.opening as string) || `Hi, is this ${firstName}?`;

  let message = baseOpening
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{name\}\}/g, firstName)
    .replace(/\[Name\]/g, firstName)
    .replace(/\[Contact Name\]/g, firstName)
    .replace(/\[Your Name\]/g, 'Arohan');

  const recentTimeline = memory.timeline.slice(-3);
  if (recentTimeline.length > 0) {
    const last = recentTimeline[recentTimeline.length - 1];
    if (last.channel === 'email') {
      message += ` I am following up on the email we sent you recently.`;
    } else if (last.channel === 'whatsapp') {
      message += ` I am following up on our WhatsApp conversation.`;
    } else if (last.channel === 'call' || last.channel === 'phone') {
      message += ` We spoke recently and I wanted to continue our conversation.`;
    }
  }

  return message;
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return fallback;
}
