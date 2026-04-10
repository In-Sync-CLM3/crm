import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * mkt-vapi-backfill-assistants
 *
 * Creates Vapi assistants for mkt_call_scripts rows that are missing a
 * vapi_assistant_id. Designed for:
 *   - Products onboarded before Vapi assistant creation was added
 *   - Retrying failed assistant creation from onboarding
 *
 * Body: { product_key: string }   (required — scope to one product at a time)
 */

interface BackfillRequest {
  product_key: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-vapi-backfill-assistants');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const vapiApiKey = Deno.env.get('VAPI_API_KEY');

    if (!vapiApiKey) throw new Error('Missing VAPI_API_KEY environment variable');

    const body: BackfillRequest = await req.json();
    const { product_key } = body;

    if (!product_key) throw new Error('product_key is required');

    // Fetch product for context
    const { data: product } = await supabase
      .from('mkt_products')
      .select('product_name, product_url')
      .eq('product_key', product_key)
      .single();

    const productName = product?.product_name || product_key;
    const productUrl = product?.product_url || '';

    // Fetch all active scripts for this product that are missing a Vapi assistant
    const { data: scripts, error: fetchErr } = await supabase
      .from('mkt_call_scripts')
      .select('id, name, product_key, call_type, objective, opening, key_points, objection_handling, closing')
      .eq('product_key', product_key)
      .eq('is_active', true)
      .is('vapi_assistant_id', null);

    if (fetchErr) throw new Error(`Failed to fetch scripts: ${fetchErr.message}`);

    if (!scripts || scripts.length === 0) {
      await logger.info('backfill-no-work', {
        product_key,
        message: 'All active scripts already have Vapi assistants',
      });
      return new Response(
        JSON.stringify({ success: true, product_key, created: 0, message: 'All scripts already have assistants' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await logger.info('backfill-started', {
      product_key,
      scripts_to_process: scripts.length,
    });

    let created = 0;
    const failures: Array<{ call_type: string; error: string }> = [];

    for (const row of scripts) {
      try {
        const systemPrompt = buildOnboardSystemPrompt(row, productName, productUrl);

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

        // Store assistant ID on the script row
        await supabase
          .from('mkt_call_scripts')
          .update({
            vapi_assistant_id: vapiResult.id,
            vapi_assistant_created_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        await logger.info('backfill-assistant-created', {
          product_key,
          call_type: row.call_type,
          assistant_id: vapiResult.id,
          script_id: row.id,
        });

        created++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        failures.push({ call_type: row.call_type, error: errMsg });
        await logger.error('backfill-assistant-failed', err, {
          product_key,
          call_type: row.call_type,
          script_id: row.id,
        });
      }
    }

    await logger.info('backfill-complete', {
      product_key,
      created,
      failed: failures.length,
      total: scripts.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        product_key,
        total: scripts.length,
        created,
        failed: failures.length,
        failures: failures.length > 0 ? failures : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    await logger.error('backfill-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

/**
 * Build the base system prompt for a Vapi assistant.
 * Same logic as mkt-product-manager — memory is injected at call-time.
 */
function buildOnboardSystemPrompt(
  script: Record<string, unknown>,
  productName: string,
  productUrl: string,
): string {
  const keyPoints = (script.key_points as string[]) || [];
  const objections = (script.objection_handling as Record<string, string>) || {};

  let prompt = `You are Arohan, an AI sales assistant. You are professional, warm, and concise.
You represent ${productName}${productUrl ? ` (${productUrl})` : ''}.

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
