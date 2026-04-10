import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { getMemory, buildContextString } from '../_shared/conversationMemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InitiateCallRequest {
  action_id: string;
  enrollment_id: string;
  lead_id: string;
  step_id: string;
  template_id?: string; // Direct mkt_call_scripts ID (legacy / fallback)
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

    const exotelDid = Deno.env.get('EXOTEL_DID');
    if (!exotelDid) throw new Error('Missing EXOTEL_DID environment variable');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from('mkt_leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) throw new Error(`Lead not found: ${lead_id}`);
    if (!lead.phone) throw new Error(`Lead ${lead_id} has no phone number`);

    const orgId = lead.org_id;

    // ---------------------------------------------------------------------------
    // Fetch call script — prefer product_key + call_type lookup, fall back to
    // template_id for backward-compatibility with existing sequence actions.
    // ---------------------------------------------------------------------------
    let script: Record<string, unknown> | null = null;

    if (lead.product_key && call_type) {
      const { data } = await supabase
        .from('mkt_call_scripts')
        .select('*')
        .eq('product_key', lead.product_key)
        .eq('call_type', call_type)
        .eq('is_active', true)
        .single();
      script = data;
    }

    if (!script && template_id) {
      const { data } = await supabase
        .from('mkt_call_scripts')
        .select('*')
        .eq('id', template_id)
        .single();
      script = data;
    }

    if (!script?.vapi_assistant_id) {
      const lookupDesc = lead.product_key && call_type
        ? `${lead.product_key} / ${call_type}`
        : `template_id ${template_id || '(none)'}`;
      await logger.warn('no-vapi-assistant', {
        lead_id,
        product_key: lead.product_key,
        call_type: call_type || null,
        template_id: template_id || null,
        message: `No Vapi assistant found for ${lookupDesc} — call aborted`,
      });
      return new Response(
        JSON.stringify({
          error: `No Vapi assistant found for ${lookupDesc}. Ensure product onboarding created assistants.`,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Get conversation memory
    const memory = await getMemory(lead_id);

    // Fetch product for additional context
    let product: Record<string, unknown> | null = null;
    if (lead.product_key) {
      const { data } = await supabase
        .from('mkt_products')
        .select('product_name, product_key, product_url, payment_url')
        .eq('product_key', lead.product_key)
        .single();
      product = data;
    }

    // Format phone number to E.164
    let formattedPhone = lead.phone.replace(/[^\d+]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
        formattedPhone = '+91' + formattedPhone;
      } else {
        formattedPhone = '+' + formattedPhone;
      }
    }

    // Build dynamic system prompt with memory injected at call-time
    const systemPrompt = buildSystemPrompt(script, memory, product, lead);
    const firstMessage = buildFirstMessage(script, memory, lead);

    // -------------------------------------------------------------------------
    // Step 1: Create Vapi web call
    // This creates a pending call session on Vapi's side with our dynamic
    // system prompt baked in via assistantOverrides. Vapi returns a WebSocket
    // URL that SuperFlow will bridge PSTN audio into.
    // -------------------------------------------------------------------------
    const vapiWebCallRes = await fetch('https://api.vapi.ai/call/web', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistantId: script.vapi_assistant_id,
        assistantOverrides: {
          model: {
            messages: [{ role: 'system', content: systemPrompt }],
          },
          firstMessage,
        },
        metadata: {
          action_id,
          enrollment_id,
          lead_id,
          org_id: orgId,
        },
      }),
    });

    if (!vapiWebCallRes.ok) {
      const errText = await vapiWebCallRes.text();
      throw new Error(`Vapi web call error ${vapiWebCallRes.status}: ${errText}`);
    }

    const vapiResult = await vapiWebCallRes.json();
    const callId = vapiResult.id as string;
    const webCallUrl = vapiResult.webCallUrl as string;

    if (!webCallUrl) {
      throw new Error('Vapi did not return a webCallUrl — check Vapi plan supports web calls');
    }

    // -------------------------------------------------------------------------
    // Step 2: Authenticate with SuperFlow
    // -------------------------------------------------------------------------
    const sfToken = await getSuperflowToken();

    // -------------------------------------------------------------------------
    // Step 3: Initiate SIP call via SuperFlow
    // SuperFlow dials the customer via the Exotel DID and bridges the PSTN
    // audio bidirectionally into the Vapi WebSocket.
    // -------------------------------------------------------------------------
    const sipRes = await fetch('https://api.superflow.run/b2b/vocallabs/createSIPCall', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sfToken}`,
      },
      body: JSON.stringify({
        phone_number: formattedPhone,
        did: exotelDid,
        websocket_url: webCallUrl,
        webhook_url: `${supabaseUrl}/functions/v1/mkt-superflow-webhook`,
        sample_rate: '16000',
      }),
    });

    if (!sipRes.ok) {
      const errText = await sipRes.text();
      throw new Error(`SuperFlow SIP call error ${sipRes.status}: ${errText}`);
    }

    const sipResult = await sipRes.json();
    // SuperFlow may use different field names — try common patterns
    const superflowCallId: string | null =
      sipResult.call_id || sipResult.id || sipResult.callId || null;

    // Update action record
    await supabase
      .from('mkt_sequence_actions')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        external_id: callId,
        metadata: {
          phone: formattedPhone,
          script_name: script.name,
          vapi_call_id: callId,
          superflow_call_id: superflowCallId,
          assistant_id: script.vapi_assistant_id,
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
      superflow_call_id: superflowCallId,
      assistant_id: script.vapi_assistant_id,
      phone: formattedPhone,
      exotel_did: exotelDid,
    });

    return new Response(
      JSON.stringify({ success: true, action_id, call_id: callId, superflow_call_id: superflowCallId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    await logger.error('initiate-call-failed', error);

    // Mark action as failed
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
// SuperFlow Auth
// ---------------------------------------------------------------------------

/**
 * Obtain a SuperFlow Bearer token using clientId + clientSecret.
 * Called once per call — stateless edge functions don't cache between requests.
 */
async function getSuperflowToken(): Promise<string> {
  const clientId = Deno.env.get('SUPERFLOW_CLIENT_ID');
  const clientSecret = Deno.env.get('SUPERFLOW_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Missing SUPERFLOW_CLIENT_ID or SUPERFLOW_CLIENT_SECRET');
  }

  const res = await fetch('https://api.superflow.run/b2b/createAuthToken/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`SuperFlow auth failed ${res.status}: ${errText}`);
  }

  const json = await res.json();
  // Handle common token field name variations
  const token = json.token || json.access_token || json.authToken || json.auth_token;
  if (!token) throw new Error(`SuperFlow auth response missing token field. Keys: ${Object.keys(json).join(', ')}`);

  return token as string;
}

// ---------------------------------------------------------------------------
// Prompt builders (unchanged)
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  script: Record<string, unknown>,
  memory: ConversationContext,
  product: Record<string, unknown> | null,
  lead: Record<string, unknown>,
): string {
  const keyPoints = (script.key_points as string[]) || [];
  const objections = (script.objection_handling as Record<string, string>) || {};
  const productName = product?.product_name || 'our product';

  let prompt = `You are Arohan, an AI sales assistant. You are professional, warm, and concise.
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
    prompt += `

CONVERSATION MEMORY BRIEFING:
${contextString}`;
  }

  if (memory.objections.length > 0) {
    const currentObjection = memory.objections[memory.objections.length - 1];
    prompt += `

CURRENT OBJECTION TO ADDRESS: ${currentObjection}`;
  }

  if (memory.interests.length > 0) {
    prompt += `

LEAD IS RESPONSIVE TO: ${memory.interests.join('; ')}`;
  }

  if (product?.payment_url) {
    prompt += `

PAYMENT URL (share if they're ready to purchase): ${product.payment_url}`;
  }

  if (keyPoints.length > 0) {
    prompt += `

KEY TALKING POINTS:
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
  }

  if (Object.keys(objections).length > 0) {
    prompt += `

OBJECTION HANDLING:
${Object.entries(objections).map(([obj, resp]) => `- If they say "${obj}": ${resp}`).join('\n')}`;
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

function buildFirstMessage(
  script: Record<string, unknown>,
  memory: ConversationContext,
  lead: Record<string, unknown>,
): string {
  const firstName = (lead.first_name as string) || 'there';
  const baseOpening = (script.opening as string) || `Hi, is this ${firstName}?`;

  let message = baseOpening
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{name\}\}/g, firstName);

  const recentTimeline = memory.timeline.slice(-3);
  if (recentTimeline.length > 0) {
    const lastInteraction = recentTimeline[recentTimeline.length - 1];
    if (lastInteraction.channel === 'email') {
      message += ` I'm following up on the email we sent you recently.`;
    } else if (lastInteraction.channel === 'whatsapp') {
      message += ` I'm following up on our WhatsApp conversation.`;
    } else if (lastInteraction.channel === 'call' || lastInteraction.channel === 'phone') {
      message += ` We spoke recently and I wanted to continue our conversation.`;
    }
  }

  return message;
}
