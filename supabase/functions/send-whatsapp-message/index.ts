import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { jsonResponse, errorResponse, handleCors } from '../_shared/responseHelpers.ts';
import { getUserFromRequest } from '../_shared/authHelpers.ts';
import {
  formatPhoneE164,
  buildExotelPayload,
  sendViaExotel,
  getWhatsAppSettings,
} from '../_shared/exotelWhatsApp.ts';

interface SendMessageRequest {
  contactId: string;
  phoneNumber: string;
  templateId?: string;
  templateVariables?: Record<string, string>;
  message?: string;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // Authenticate user and get org
    const { user, orgId, supabaseClient } = await getUserFromRequest(req);

    const body: SendMessageRequest = await req.json();
    const { contactId, phoneNumber, templateId, templateVariables, message } = body;

    // Get WhatsApp settings
    const exotelSettings = await getWhatsAppSettings(supabaseClient, orgId);
    if (!exotelSettings) {
      return jsonResponse({ error: 'WhatsApp not configured for this organization' }, 404);
    }
    if (!exotelSettings.whatsapp_source_number) {
      return jsonResponse({ error: 'WhatsApp source number not configured' }, 400);
    }

    let messageContent = message || '';
    let templateData = null;

    // If using a template, fetch it and prepare message
    if (templateId) {
      const { data: template } = await supabaseClient
        .from('communication_templates')
        .select('*')
        .eq('id', templateId)
        .eq('org_id', orgId)
        .single();

      if (!template) {
        return jsonResponse({ error: 'Template not found' }, 404);
      }

      messageContent = template.content;

      // Replace variables in template
      if (templateVariables) {
        Object.entries(templateVariables).forEach(([key, value]) => {
          messageContent = messageContent.replace(new RegExp(`{{${key}}}`, 'g'), value);
        });
      }

      templateData = {
        name: template.template_id,
        language: template.language || 'en',
        components: buildTemplateComponents(template, templateVariables),
      };
    }

    const formattedPhone = formatPhoneE164(phoneNumber);
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook`;

    // Build and send
    const content = templateData
      ? { type: 'template', template: templateData }
      : { recipient_type: 'individual', type: 'text', text: { preview_url: false, body: messageContent } };

    const payload = buildExotelPayload({
      sourceNumber: exotelSettings.whatsapp_source_number,
      toNumber: formattedPhone,
      content,
      customData: contactId,
      statusCallback: webhookUrl,
    });

    const result = await sendViaExotel(exotelSettings, payload);

    if (!result.success) {
      // Log failed message
      await supabaseClient.from('whatsapp_messages').insert({
        org_id: orgId,
        contact_id: contactId,
        template_id: templateId || null,
        sent_by: user.id,
        phone_number: formattedPhone,
        message_content: messageContent,
        template_variables: templateVariables || null,
        status: 'failed',
        error_message: result.error,
        exotel_status_code: String(result.statusCode),
      });

      return jsonResponse({ error: result.error }, result.statusCode);
    }

    // Log successful message
    const { data: messageRecord } = await supabaseClient
      .from('whatsapp_messages')
      .insert({
        org_id: orgId,
        contact_id: contactId,
        template_id: templateId || null,
        sent_by: user.id,
        phone_number: formattedPhone,
        message_content: messageContent,
        template_variables: templateVariables || null,
        exotel_message_id: result.messageSid,
        status: 'sent',
      })
      .select()
      .single();

    // Deduct WhatsApp cost from wallet
    const supabaseServiceClient = getSupabaseClient();
    const { data: deductResult, error: deductError } = await supabaseServiceClient.rpc('deduct_from_wallet', {
      _org_id: orgId,
      _amount: 1.00,
      _service_type: 'whatsapp',
      _reference_id: messageRecord?.id,
      _quantity: 1,
      _unit_cost: 1.00,
      _user_id: user.id,
    });

    if (deductError || !deductResult?.success) {
      console.warn('Wallet deduction failed:', deductError || deductResult);
    }

    // Log activity
    await supabaseClient.from('contact_activities').insert({
      org_id: orgId,
      contact_id: contactId,
      activity_type: 'whatsapp',
      subject: 'WhatsApp Message Sent',
      description: messageContent,
      created_by: user.id,
    });

    return jsonResponse({
      success: true,
      messageId: result.messageSid,
      message: messageRecord,
    });
  } catch (error) {
    const err = error as Error;
    console.error('send-whatsapp-message error:', err.message);
    const status = err.message?.includes('Authentication') ? 401 : 500;
    return errorResponse(error, status);
  }
});

// Helper function to build template components for Exotel format
function buildTemplateComponents(template: any, variables?: Record<string, string>): any[] {
  const components: any[] = [];

  if (template.header_type && template.header_content) {
    const headerComponent: any = { type: 'header' };
    if (template.header_type === 'text') {
      headerComponent.parameters = [{ type: 'text', text: template.header_content }];
    } else if (['image', 'video', 'document'].includes(template.header_type)) {
      headerComponent.parameters = [{
        type: template.header_type,
        [template.header_type]: { link: template.header_content },
      }];
    }
    components.push(headerComponent);
  }

  if (variables && Object.keys(variables).length > 0) {
    components.push({
      type: 'body',
      parameters: Object.values(variables).map(value => ({ type: 'text', text: value })),
    });
  }

  if (template.buttons && Array.isArray(template.buttons)) {
    template.buttons.forEach((button: any, index: number) => {
      if (button.type === 'url' && button.url?.includes('{{')) {
        components.push({
          type: 'button',
          sub_type: 'url',
          index,
          parameters: [{ type: 'text', text: variables?.[`button_${index}`] || '' }],
        });
      }
    });
  }

  return components;
}
