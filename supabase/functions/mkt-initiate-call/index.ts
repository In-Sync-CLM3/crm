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
  template_id?: string; // References mkt_call_scripts
  channel: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-initiate-call');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    const body: InitiateCallRequest = await req.json();
    const { action_id, enrollment_id, lead_id, template_id } = body;

    const vapiApiKey = Deno.env.get('VAPI_API_KEY');
    if (!vapiApiKey) throw new Error('Missing VAPI_API_KEY environment variable');

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from('mkt_leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) throw new Error(`Lead not found: ${lead_id}`);
    if (!lead.phone) throw new Error(`Lead ${lead_id} has no phone number`);

    const orgId = lead.org_id;

    // Fetch call script
    let script: Record<string, unknown> | null = null;
    if (template_id) {
      const { data } = await supabase
        .from('mkt_call_scripts')
        .select('*')
        .eq('id', template_id)
        .single();
      script = data;
    }

    if (!script) {
      // Use a default script if none specified
      script = {
        name: 'Default Outreach',
        objective: 'Introduce the product and gauge interest',
        opening: `Hi, is this ${lead.first_name || 'there'}? I'm calling from the team. Do you have a moment?`,
        key_points: ['Introduce the product briefly', 'Ask about their current pain points', 'Offer a demo if interested'],
        objection_handling: {
          'not interested': 'I understand. May I ask what solution you currently use?',
          'too busy': 'I completely understand. When would be a better time to call back?',
          'send email': 'Of course! I\'ll send you a brief email. What\'s the best email address?',
        },
        closing: 'Thank you for your time. I\'ll follow up as discussed.',
        voice_id: null,
        language: 'en',
        max_duration_seconds: 300,
      };
    }

    // Get conversation context
    const context = await getMemory(lead_id);
    const contextString = buildContextString(context);

    // Format phone number
    let formattedPhone = lead.phone.replace(/[^\d+]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
        formattedPhone = '+91' + formattedPhone;
      } else {
        formattedPhone = '+' + formattedPhone;
      }
    }

    // Build the Vapi call configuration
    const systemPrompt = buildVapiSystemPrompt(script, lead, contextString);

    const vapiPayload: Record<string, unknown> = {
      assistantId: undefined, // We'll use assistantOverrides with inline config
      phoneNumberId: Deno.env.get('VAPI_PHONE_NUMBER_ID') || undefined,
      customer: {
        number: formattedPhone,
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Lead',
      },
      assistant: {
        model: {
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: systemPrompt }],
          temperature: 0.4,
          maxTokens: 256,
        },
        voice: {
          provider: 'elevenlabs',
          voiceId: (script.voice_id as string) || Deno.env.get('VAPI_DEFAULT_VOICE_ID') || 'pNInz6obpgDQGcFmaJgB',
        },
        firstMessage: script.opening as string,
        endCallMessage: script.closing as string || 'Thank you for your time. Goodbye!',
        maxDurationSeconds: (script.max_duration_seconds as number) || 300,
        silenceTimeoutSeconds: 10,
        responseDelaySeconds: 0.5,
        llmRequestDelaySeconds: 0.1,
        serverUrl: `${supabaseUrl}/functions/v1/mkt-vapi-webhook`,
        serverUrlSecret: Deno.env.get('VAPI_WEBHOOK_SECRET') || undefined,
      },
      metadata: {
        action_id,
        enrollment_id,
        lead_id,
        org_id: orgId,
      },
    };

    // If no phone number ID, we need to use web call or skip
    if (!vapiPayload.phoneNumberId && !Deno.env.get('VAPI_PHONE_NUMBER_ID')) {
      // Try outbound call without phone number ID (Vapi may use default)
      delete vapiPayload.phoneNumberId;
    }

    // Create Vapi call
    const vapiResponse = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(vapiPayload),
    });

    if (!vapiResponse.ok) {
      const errText = await vapiResponse.text();
      throw new Error(`Vapi API error ${vapiResponse.status}: ${errText}`);
    }

    const vapiResult = await vapiResponse.json();
    const callId = vapiResult.id;

    // Update action record
    await supabase
      .from('mkt_sequence_actions')
      .update({
        status: 'sent', // "sent" means call initiated
        sent_at: new Date().toISOString(),
        external_id: callId,
        metadata: {
          phone: formattedPhone,
          script_name: script.name,
          vapi_call_id: callId,
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
      call_id: callId,
      phone: formattedPhone,
    });

    return new Response(
      JSON.stringify({ success: true, action_id, call_id: callId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Build the Vapi system prompt from call script + lead context.
 */
function buildVapiSystemPrompt(
  script: Record<string, unknown>,
  lead: Record<string, unknown>,
  contextString: string
): string {
  const keyPoints = (script.key_points as string[]) || [];
  const objections = (script.objection_handling as Record<string, string>) || {};

  let prompt = `You are an AI sales assistant making an outbound call. Be professional, friendly, and concise.

CALL OBJECTIVE: ${script.objective || 'Introduce the product and gauge interest'}

LEAD INFO:
- Name: ${lead.first_name || 'there'} ${lead.last_name || ''}
- Company: ${lead.company || 'N/A'}
- Title: ${lead.job_title || 'N/A'}
- Industry: ${lead.industry || 'N/A'}`;

  if (contextString && contextString !== 'No prior conversation history.') {
    prompt += `

PRIOR CONVERSATION CONTEXT:
${contextString}`;
  }

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

RULES:
- Keep responses under 2-3 sentences. Be conversational, not scripted.
- If they're not interested, be respectful and end the call gracefully.
- If they ask to be removed from the call list, acknowledge and end the call.
- Never be pushy or aggressive. Mirror their tone and pace.
- If they ask who you are, say you're an AI assistant calling on behalf of the team.
- Always end with a clear next step (demo booking, email follow-up, or callback time).`;

  return prompt;
}
