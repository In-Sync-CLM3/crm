import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { getMemory, updateMemory, buildContextString } from '../_shared/conversationMemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendWhatsAppRequest {
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

  const logger = createEngineLogger('mkt-send-whatsapp');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    const body: SendWhatsAppRequest = await req.json();
    const { action_id, lead_id, template_id } = body;

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from('mkt_leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) throw new Error(`Lead not found: ${lead_id}`);

    if (!lead.phone) {
      throw new Error(`Lead ${lead_id} has no phone number`);
    }

    const orgId = lead.org_id;

    // Fetch Exotel settings for this org
    const { data: exotelSettings } = await supabase
      .from('exotel_settings')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .eq('whatsapp_enabled', true)
      .single();

    if (!exotelSettings) {
      throw new Error('WhatsApp not configured for this organization');
    }

    if (!exotelSettings.whatsapp_source_number) {
      throw new Error('WhatsApp source number not configured');
    }

    // Fetch WhatsApp template
    let templateData: Record<string, unknown> | null = null;
    let messageContent = '';

    if (template_id) {
      const { data: template } = await supabase
        .from('mkt_whatsapp_templates')
        .select('*')
        .eq('id', template_id)
        .single();

      if (template) {
        templateData = template;
        messageContent = template.body as string;

        // Replace template variables
        const vars: Record<string, string> = {
          '{{first_name}}': lead.first_name || 'there',
          '{{last_name}}': lead.last_name || '',
          '{{company}}': lead.company || 'your company',
          '{{job_title}}': lead.job_title || '',
        };

        for (const [key, value] of Object.entries(vars)) {
          messageContent = messageContent.replaceAll(key, value);
        }
      }
    }

    if (!messageContent) {
      throw new Error('No template content resolved');
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

    // Build webhook URL
    const webhookUrl = `${supabaseUrl}/functions/v1/mkt-whatsapp-webhook`;

    // Build Exotel WhatsApp API request
    const exotelUrl = `https://${exotelSettings.api_key}:${exotelSettings.api_token}@${exotelSettings.subdomain}/v2/accounts/${exotelSettings.account_sid}/messages`;

    const exotelPayload: Record<string, unknown> = {
      custom_data: JSON.stringify({ action_id, lead_id, enrollment_id: body.enrollment_id }),
      status_callback: webhookUrl,
      whatsapp: {
        messages: [
          {
            from: exotelSettings.whatsapp_source_number,
            to: formattedPhone,
            content: templateData?.template_name
              ? {
                  type: 'template',
                  template: {
                    name: templateData.template_name,
                    language: templateData.language || 'en',
                    components: buildTemplateComponents(templateData, lead),
                  },
                }
              : {
                  recipient_type: 'individual',
                  type: 'text',
                  text: { preview_url: false, body: messageContent },
                },
          },
        ],
      },
    };

    const exotelResponse = await fetch(exotelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exotelPayload),
    });

    const exotelResult = await exotelResponse.json();
    const messageResponse = exotelResult?.response?.whatsapp?.messages?.[0];
    const isSuccess = exotelResponse.ok && messageResponse?.code === 200;

    if (!isSuccess) {
      const errorMsg = messageResponse?.error_data?.message || exotelResult?.message || 'Failed to send';
      throw new Error(`Exotel WhatsApp error: ${errorMsg}`);
    }

    const messageSid = messageResponse?.data?.sid;

    // Update action record
    await supabase
      .from('mkt_sequence_actions')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        external_id: messageSid,
        metadata: {
          phone: formattedPhone,
          template_name: templateData?.template_name || 'free_text',
          message_preview: messageContent.substring(0, 100),
        },
      })
      .eq('id', action_id);

    // Update conversation memory
    await updateMemory(lead_id, orgId, 'whatsapp', {
      direction: 'outbound',
      summary: `Sent WhatsApp: ${messageContent.substring(0, 80)}...`,
      details: { template_name: templateData?.name, phone: formattedPhone },
    });

    // Deduct wallet cost
    await supabase.rpc('deduct_from_wallet', {
      _org_id: orgId,
      _amount: 1.00,
      _service_type: 'whatsapp',
      _reference_id: action_id,
      _quantity: 1,
      _unit_cost: 1.00,
      _user_id: null,
    }).catch((err: Error) => {
      console.warn('[mkt-send-whatsapp] Wallet deduction failed:', err.message);
    });

    await logger.info('whatsapp-sent', {
      lead_id,
      action_id,
      phone: formattedPhone,
      message_sid: messageSid,
    });

    return new Response(
      JSON.stringify({ success: true, action_id, message_sid: messageSid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('send-whatsapp-failed', error);

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
 * Build template components for Exotel WhatsApp format.
 */
function buildTemplateComponents(
  template: Record<string, unknown>,
  lead: Record<string, unknown>
): Array<Record<string, unknown>> {
  const components: Array<Record<string, unknown>> = [];

  // Body component with variables
  const variables = template.variables as string[] | undefined;
  if (variables && variables.length > 0) {
    const bodyParameters = variables.map((varName: string) => ({
      type: 'text',
      text: String((lead as Record<string, unknown>)[varName] || varName),
    }));

    components.push({ type: 'body', parameters: bodyParameters });
  }

  // Header component
  if (template.header) {
    components.push({
      type: 'header',
      parameters: [{ type: 'text', text: template.header as string }],
    });
  }

  return components;
}
