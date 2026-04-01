import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callGroqJson } from '../_shared/groqClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractRequest {
  lead_id?: string;
  org_id: string;
  source_channel: string; // email-reply | vapi-transcript | nps-response | exit-survey | onboarding-reply
  text: string;
}

interface ExtractedSignal {
  product_key: string;
  signal_text: string;
  signal_category: string;
  is_monetisable: boolean;
  vertical?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-feature-signal-extractor');

  try {
    const supabase = getSupabaseClient();
    const body: ExtractRequest = await req.json();
    const { lead_id, org_id, source_channel, text } = body;

    if (!text || text.trim().length < 10) {
      return new Response(
        JSON.stringify({ message: 'Text too short to analyze', signals: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get lead info for context
    let leadContext = '';
    let designationGroup = '';
    let vertical = '';

    if (lead_id) {
      const { data: lead } = await supabase
        .from('mkt_leads')
        .select('job_title, company, industry')
        .eq('id', lead_id)
        .single();

      if (lead) {
        leadContext = `Lead: ${lead.job_title || 'N/A'} at ${lead.company || 'N/A'} (${lead.industry || 'N/A'})`;
        designationGroup = categorizeDesignation(lead.job_title || '');
        vertical = lead.industry || '';
      }
    }

    // Extract signals using Groq (fast classification)
    const prompt = `You are a product signal extractor for a B2B SaaS CRM company. Analyze this customer interaction and extract any product-related signals.

SOURCE: ${source_channel}
${leadContext ? `CONTEXT: ${leadContext}` : ''}

TEXT:
${text.substring(0, 3000)}

Extract product signals — things the customer is asking for, complaining about, or expressing interest in. Each signal should be a distinct product insight.

Return JSON:
{
  "signals": [
    {
      "product_key": "short-kebab-case-key (e.g. bulk-import-csv, whatsapp-scheduling, pipeline-automation)",
      "signal_text": "Exact quote or close paraphrase from the text",
      "signal_category": "feature-request|workflow-complaint|integration-request|performance-issue|pricing-feedback|ux-friction|other",
      "is_monetisable": true/false (could this be a paid feature or upsell?)
    }
  ]
}

RULES:
- Only extract genuine product signals — not greetings, thank-yous, or general conversation
- product_key must be consistent — if someone asks for "CSV import" and another asks for "bulk upload from Excel", both should map to "bulk-import-csv"
- If no signals found, return {"signals": []}
- Max 5 signals per interaction`;

    const { data: result, tokens } = await callGroqJson<{ signals: ExtractedSignal[] }>(prompt, {
      max_tokens: 512,
      temperature: 0.1,
    });

    const signals = result.signals || [];

    if (signals.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No product signals detected', signals: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert signals — deduplicate by product_key within org
    let inserted = 0;
    let updated = 0;

    for (const signal of signals) {
      // Check if this product_key already exists for this org
      const { data: existing } = await supabase
        .from('mkt_feature_signals')
        .select('id, frequency_count, signal_text')
        .eq('org_id', org_id)
        .eq('product_key', signal.product_key)
        .single();

      if (existing) {
        // Increment frequency and update last_seen
        await supabase
          .from('mkt_feature_signals')
          .update({
            frequency_count: (existing.frequency_count || 1) + 1,
            last_seen_at: new Date().toISOString(),
            signal_text: `${existing.signal_text}\n---\n${signal.signal_text}`.substring(0, 2000),
          })
          .eq('id', existing.id);
        updated++;
      } else {
        await supabase.from('mkt_feature_signals').insert({
          org_id,
          lead_id: lead_id || null,
          product_key: signal.product_key,
          signal_text: signal.signal_text,
          signal_category: signal.signal_category,
          is_monetisable: signal.is_monetisable,
          vertical: vertical || signal.vertical || null,
          designation_group: designationGroup || null,
          source_channel,
          frequency_count: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        });
        inserted++;
      }
    }

    await logger.info('signals-extracted', {
      lead_id,
      source_channel,
      signals_found: signals.length,
      inserted,
      updated,
    }, { tokens_used: tokens.input + tokens.output });

    return new Response(
      JSON.stringify({
        success: true,
        signals_found: signals.length,
        inserted,
        updated,
        signals: signals.map((s) => ({ product_key: s.product_key, category: s.signal_category })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('extractor-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Categorize job title into designation group for signal aggregation.
 */
function categorizeDesignation(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('ceo') || lower.includes('founder') || lower.includes('owner') || lower.includes('director')) {
    return 'C-Suite/Founder';
  }
  if (lower.includes('vp') || lower.includes('vice president') || lower.includes('head of')) {
    return 'VP/Head';
  }
  if (lower.includes('manager') || lower.includes('lead') || lower.includes('team lead')) {
    return 'Manager';
  }
  if (lower.includes('engineer') || lower.includes('developer') || lower.includes('architect')) {
    return 'Engineering';
  }
  if (lower.includes('sales') || lower.includes('account') || lower.includes('business development')) {
    return 'Sales/BD';
  }
  if (lower.includes('marketing') || lower.includes('growth')) {
    return 'Marketing';
  }
  if (lower.includes('operations') || lower.includes('ops')) {
    return 'Operations';
  }
  return 'Other';
}
