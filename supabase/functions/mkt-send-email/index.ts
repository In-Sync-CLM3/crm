import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLM } from '../_shared/llmClient.ts';
import { getMemory, updateMemory, buildContextString } from '../_shared/conversationMemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendEmailRequest {
  action_id: string;
  enrollment_id: string;
  lead_id: string;
  step_id: string;
  template_id?: string;
  ab_test_id?: string;
  channel: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-send-email');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body: SendEmailRequest = await req.json();
    const { action_id, enrollment_id, lead_id, step_id, template_id, ab_test_id } = body;

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from('mkt_leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) throw new Error(`Lead not found: ${lead_id}`);

    const orgId = lead.org_id;

    // Resolve template (handle A/B testing)
    let selectedTemplateId = template_id;
    let variant: string | null = null;

    if (ab_test_id) {
      const abResult = await resolveABVariant(supabase, ab_test_id);
      if (abResult) {
        selectedTemplateId = abResult.templateId;
        variant = abResult.variant;
      }
    }

    if (!selectedTemplateId) {
      throw new Error('No template_id resolved for this step');
    }

    // Fetch the email template
    const { data: template, error: templateError } = await supabase
      .from('mkt_email_templates')
      .select('*')
      .eq('id', selectedTemplateId)
      .single();

    if (templateError || !template) throw new Error(`Template not found: ${selectedTemplateId}`);

    // Get conversation context for personalization
    const conversationContext = await getMemory(lead_id);
    const contextString = buildContextString(conversationContext);

    // Personalize the email using Haiku
    const personalizedContent = await personalizeEmail(
      template,
      lead,
      contextString
    );

    // Generate tracking IDs
    const trackingPixelId = `mkt_${action_id}_${Date.now()}`;
    const unsubscribeToken = crypto.randomUUID();

    // Build final HTML
    let finalHtml = personalizedContent.html;

    // Add unsubscribe link
    const unsubscribeUrl = `${supabaseUrl}/functions/v1/mkt-email-webhook?action=unsubscribe&token=${unsubscribeToken}&lead_id=${lead_id}&org_id=${orgId}`;
    const unsubscribeBlock = `
      <div style="margin: 40px 0 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
          <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
        </p>
      </div>
    `;
    finalHtml = finalHtml.replace('</body>', `${unsubscribeBlock}</body>`);
    if (!finalHtml.includes('</body>')) {
      finalHtml += unsubscribeBlock;
    }

    // Add tracking pixel
    const trackingPixel = `<img src="${supabaseUrl}/functions/v1/mkt-email-webhook?action=open&id=${trackingPixelId}" width="1" height="1" style="display:none" alt="" />`;
    finalHtml = finalHtml.replace('</body>', `${trackingPixel}</body>`);
    if (!finalHtml.includes('</body>')) {
      finalHtml += trackingPixel;
    }

    // Wrap links with click tracking
    finalHtml = finalHtml.replace(
      /<a\s+([^>]*href=["']([^"']+)["'][^>]*)>/gi,
      (match, attrs, url) => {
        if (url.includes('unsubscribe') || url.includes('mkt-email-webhook')) return match;
        const trackedUrl = `${supabaseUrl}/functions/v1/mkt-email-webhook?action=click&id=${trackingPixelId}&url=${encodeURIComponent(url)}`;
        return match.replace(url, trackedUrl);
      }
    );

    // Send via the existing send-email function (Resend)
    const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: lead.email,
        subject: personalizedContent.subject,
        html: finalHtml,
        from_name: template.from_name || undefined,
        reply_to: template.reply_to || undefined,
        trackingPixelId,
        tags: ['mkt-engine', `campaign-${lead.campaign_id}`],
      }),
    });

    if (!sendResponse.ok) {
      const errText = await sendResponse.text();
      throw new Error(`Send email failed: ${sendResponse.status} ${errText}`);
    }

    const sendResult = await sendResponse.json();

    // Update the action record
    await supabase
      .from('mkt_sequence_actions')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        variant,
        external_id: sendResult.messageId || sendResult.id || null,
        metadata: {
          subject: personalizedContent.subject,
          tracking_pixel_id: trackingPixelId,
          unsubscribe_token: unsubscribeToken,
          template_id: selectedTemplateId,
          personalized: personalizedContent.wasPersonalized,
        },
      })
      .eq('id', action_id);

    // Update conversation memory
    await updateMemory(lead_id, orgId, 'email', {
      direction: 'outbound',
      summary: `Sent email: "${personalizedContent.subject}"`,
      details: { template_name: template.name, variant },
    });

    // If A/B test, record the send
    if (ab_test_id && variant) {
      await supabase.rpc('increment_ab_test_sends', {
        _ab_test_id: ab_test_id,
        _variant: variant,
      }).catch(() => {
        // If RPC doesn't exist yet, update manually
        supabase
          .from('mkt_ab_test_results')
          .update({ sends: supabase.rpc('') }) // handled via direct increment below
      });

      // Direct increment as fallback
      const { data: abResult } = await supabase
        .from('mkt_ab_test_results')
        .select('sends')
        .eq('ab_test_id', ab_test_id)
        .eq('variant', variant)
        .single();

      if (abResult) {
        await supabase
          .from('mkt_ab_test_results')
          .update({ sends: (abResult.sends || 0) + 1 })
          .eq('ab_test_id', ab_test_id)
          .eq('variant', variant);
      } else {
        await supabase.from('mkt_ab_test_results').insert({
          org_id: orgId,
          ab_test_id,
          variant,
          sends: 1,
        });
      }
    }

    await logger.info('email-sent', {
      lead_id,
      action_id,
      subject: personalizedContent.subject,
      variant,
    }, { tokens_used: personalizedContent.tokensUsed });

    return new Response(
      JSON.stringify({ success: true, action_id, subject: personalizedContent.subject }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('send-email-failed', error);

    // Try to mark action as failed
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
 * Personalize email subject and body using Haiku.
 * Replaces {{variables}} and optionally rewrites for context.
 */
async function personalizeEmail(
  template: Record<string, unknown>,
  lead: Record<string, unknown>,
  contextString: string
): Promise<{ subject: string; html: string; wasPersonalized: boolean; tokensUsed: number }> {
  let subject = template.subject as string;
  let html = template.body_html as string;

  // Replace standard variables
  const vars: Record<string, string> = {
    '{{first_name}}': (lead.first_name as string) || 'there',
    '{{last_name}}': (lead.last_name as string) || '',
    '{{company}}': (lead.company as string) || 'your company',
    '{{job_title}}': (lead.job_title as string) || '',
    '{{industry}}': (lead.industry as string) || '',
    '{{city}}': (lead.city as string) || '',
  };

  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replaceAll(key, value);
    html = html.replaceAll(key, value);
  }

  // If there's conversation context, use Haiku to add a personal touch
  let tokensUsed = 0;
  let wasPersonalized = false;

  if (contextString && contextString !== 'No prior conversation history.') {
    try {
      const response = await callLLM(
        `You are personalizing a marketing email. Add a brief personal touch based on the conversation context, but keep the email professional and concise. Do NOT change the core message or CTA.

CONVERSATION CONTEXT:
${contextString}

CURRENT EMAIL SUBJECT: ${subject}
CURRENT EMAIL BODY (first 500 chars): ${html.replace(/<[^>]*>/g, '').substring(0, 500)}

Return ONLY a JSON object:
{
  "personalized_opening": "A 1-2 sentence opening line that references prior context (or empty string if no good context to reference)",
  "subject_tweak": "The subject line, optionally tweaked for context (or same as original if no change needed)"
}`,
        { model: 'haiku', max_tokens: 256, temperature: 0.4, json_mode: true }
      );

      let jsonStr = response.content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr);
      tokensUsed = response.input_tokens + response.output_tokens;

      if (parsed.personalized_opening) {
        // Insert after the first <body> tag or at the start
        const openingHtml = `<p style="margin-bottom: 16px;">${parsed.personalized_opening}</p>`;
        if (html.includes('<body')) {
          html = html.replace(/(<body[^>]*>)/, `$1${openingHtml}`);
        } else {
          html = openingHtml + html;
        }
        wasPersonalized = true;
      }

      if (parsed.subject_tweak && parsed.subject_tweak !== subject) {
        subject = parsed.subject_tweak;
        wasPersonalized = true;
      }
    } catch (error) {
      console.error('[mkt-send-email] Personalization failed, using template as-is:', error);
    }
  }

  return { subject, html, wasPersonalized, tokensUsed };
}

/**
 * Resolve A/B test variant. Returns template ID and variant label.
 */
async function resolveABVariant(
  supabase: ReturnType<typeof getSupabaseClient>,
  abTestId: string
): Promise<{ templateId: string; variant: string } | null> {
  const { data: abTest } = await supabase
    .from('mkt_ab_tests')
    .select('variants, status, winner')
    .eq('id', abTestId)
    .single();

  if (!abTest || abTest.status !== 'active') return null;

  // If there's already a winner, always use it
  if (abTest.winner) {
    const winnerVariant = (abTest.variants as Array<{ id: string; template_id: string }>)
      .find((v) => v.id === abTest.winner);
    if (winnerVariant) {
      return { templateId: winnerVariant.template_id, variant: winnerVariant.id };
    }
  }

  // Weighted random selection
  const variants = abTest.variants as Array<{ id: string; template_id: string; weight: number }>;
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 50), 0);
  const random = Math.random() * totalWeight;

  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight || 50;
    if (random <= cumulative) {
      return { templateId: variant.template_id, variant: variant.id };
    }
  }

  return { templateId: variants[0].template_id, variant: variants[0].id };
}
