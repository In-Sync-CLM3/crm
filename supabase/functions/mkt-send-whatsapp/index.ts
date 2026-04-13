import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { updateMemory } from '../_shared/conversationMemory.ts';
import { jsonResponse, errorResponse, handleCors } from '../_shared/responseHelpers.ts';
import {
  formatPhoneE164,
  buildExotelPayload,
  sendViaExotel,
  getWhatsAppSettings,
} from '../_shared/exotelWhatsApp.ts';

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
  const cors = handleCors(req);
  if (cors) return cors;

  const logger = createEngineLogger('mkt-send-whatsapp');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    const body: SendWhatsAppRequest = await req.json();
    const { action_id, lead_id, template_id } = body;

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) throw new Error(`Lead not found: ${lead_id}`);
    if (!lead.phone) throw new Error(`Lead ${lead_id} has no phone number`);

    const orgId = lead.org_id;

    // Get WhatsApp settings
    const exotelSettings = await getWhatsAppSettings(supabase, orgId);
    if (!exotelSettings) throw new Error('WhatsApp not configured for this organization');
    if (!exotelSettings.whatsapp_source_number) throw new Error('WhatsApp source number not configured');

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
          '{{1}}': lead.first_name || 'there',
          '{{2}}': lead.company || 'your company',
          '{{3}}': lead.job_title || '',
        };

        for (const [key, value] of Object.entries(vars)) {
          messageContent = messageContent.replaceAll(key, value);
        }
      }
    }

    if (!messageContent) throw new Error('No template content resolved');

    const formattedPhone = formatPhoneE164(lead.phone);
    const webhookUrl = `${supabaseUrl}/functions/v1/mkt-whatsapp-webhook`;

    // Build and send
    const payload = buildExotelPayload({
      sourceNumber: exotelSettings.whatsapp_source_number,
      toNumber: formattedPhone,
      content: {
        recipient_type: 'individual',
        type: 'text',
        text: { preview_url: false, body: messageContent },
      },
      customData: JSON.stringify({ action_id, lead_id, enrollment_id: body.enrollment_id }),
      statusCallback: webhookUrl,
    });

    console.log('[mkt-send-whatsapp] Sending to:', formattedPhone);

    const result = await sendViaExotel(exotelSettings, payload);

    if (!result.success) {
      throw new Error(`Exotel WhatsApp error: ${result.error}`);
    }

    // Update action record
    await supabase
      .from('mkt_sequence_actions')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        external_id: result.messageSid,
        metadata: {
          phone: formattedPhone,
          template_name: (templateData as any)?.template_name || 'free_text',
          message_preview: messageContent.substring(0, 100),
        },
      })
      .eq('id', action_id);

    // Update conversation memory
    await updateMemory(lead_id, orgId, 'whatsapp', {
      direction: 'outbound',
      summary: `Sent WhatsApp: ${messageContent.substring(0, 80)}...`,
      details: { template_name: (templateData as any)?.name, phone: formattedPhone },
    });

    // Deduct wallet cost
    try {
      await supabase.rpc('deduct_from_wallet', {
        _org_id: orgId,
        _amount: 1.00,
        _service_type: 'whatsapp',
        _reference_id: action_id,
        _quantity: 1,
        _unit_cost: 1.00,
        _user_id: null,
      });
    } catch (err) {
      console.warn('[mkt-send-whatsapp] Wallet deduction failed:', err);
    }

    await logger.info('whatsapp-sent', {
      lead_id,
      action_id,
      phone: formattedPhone,
      message_sid: result.messageSid,
    });

    return jsonResponse({ success: true, action_id, message_sid: result.messageSid });
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

    return errorResponse(error);
  }
});
