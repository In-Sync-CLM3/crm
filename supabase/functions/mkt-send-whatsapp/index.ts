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

    // ── Template pool rotation ───────────────────────────────────────────────
    // If the step has a template_ids pool, pick the least-recently-cycled approved
    // template (round-robin by total sends mod pool size).
    // Falls back to the single template_id param for backward compatibility.
    let resolvedTemplateId: string | undefined = template_id;

    if (body.step_id) {
      const { data: stepData } = await supabase
        .from('mkt_campaign_steps')
        .select('template_ids')
        .eq('id', body.step_id)
        .single();

      const poolIds: string[] = stepData?.template_ids ?? [];

      if (poolIds.length > 0) {
        const { data: poolRows } = await supabase
          .from('mkt_whatsapp_templates')
          .select('id, approval_status')
          .in('id', poolIds);

        const approved = (poolRows ?? [])
          .filter((t) => t.approval_status === 'approved')
          .map((t) => t.id as string);

        if (approved.length > 0) {
          // Count total sends so far for this step to get a rotation index
          const { count: sentCount } = await supabase
            .from('mkt_sequence_actions')
            .select('id', { count: 'exact', head: true })
            .eq('step_id', body.step_id)
            .in('status', ['sent', 'delivered', 'pending']);

          resolvedTemplateId = approved[(sentCount ?? 0) % approved.length];

          // Warn when the pool is running low
          if (approved.length < 2) {
            await logger.warn('template-pool-low', {
              step_id: body.step_id,
              approved_count: approved.length,
              total_pool: poolIds.length,
            });
          }
        } else if (poolIds.length > 0) {
          // Pool exists but no approved templates yet (all submitted/paused) — stop here
          throw new Error(
            `No approved WhatsApp templates in pool for step ${body.step_id}. ` +
            `Pool has ${poolIds.length} template(s) but none are approved by Meta yet.`
          );
        }
        // If pool is empty, fall through to original template_id param
      }
    }

    // Fetch WhatsApp template
    let templateData: Record<string, unknown> | null = null;
    let messageContent = '';

    if (resolvedTemplateId) {
      const { data: template } = await supabase
        .from('mkt_whatsapp_templates')
        .select('*')
        .eq('id', resolvedTemplateId)
        .single();

      if (template) {
        templateData = template;
        messageContent = template.body as string;

        // Build variable value map ({{1}}, {{2}}, ... correspond to template.variables array order)
        const workspaceName = resolveWorkspaceName(template.template_name as string);
        const varValueMap: Record<string, string> = {
          first_name:       lead.first_name || 'there',
          last_name:        lead.last_name  || '',
          company:          lead.company    || 'your company',
          job_title:        lead.job_title  || '',
          workspace_name:   workspaceName,
          days_left:        '7',
          days_inactive:    '30',
          feature_name:     'Smart Vendor Verification',
          improvement_stat: '40%',
          new_feature_name: 'Smart Analytics',
        };

        // Replace named placeholders in body (for preview/logging only)
        const varNames: string[] = (template.variables as string[]) || [];
        varNames.forEach((name, idx) => {
          const val = varValueMap[name] || name;
          messageContent = messageContent
            .replaceAll(`{{${idx + 1}}}`, val)
            .replaceAll(`{{${name}}}`, val);
        });
      }
    }

    if (!messageContent) throw new Error('No template content resolved');

    // ── UTM decoration ──────────────────────────────────────────────────────
    // Look up campaign context to build proper UTM parameters.
    const { data: actionRow } = await supabase
      .from('mkt_sequence_actions')
      .select('enrollment_id, mkt_sequence_enrollments!inner(campaign_id, mkt_campaigns!inner(name, product_key, mkt_products(product_url)))')
      .eq('id', action_id)
      .single();

    const campaignName = (actionRow as any)
      ?.mkt_sequence_enrollments?.mkt_campaigns?.name ?? 'mkt_whatsapp';
    const productUrl   = (actionRow as any)
      ?.mkt_sequence_enrollments?.mkt_campaigns?.mkt_products?.product_url ?? null;

    const utmSuffix = `utm_source=insync_engine&utm_medium=whatsapp&utm_campaign=${encodeURIComponent(campaignName.replace(/\s+/g,'_').toLowerCase())}&utm_content=${action_id}`;

    // Append UTMs to any https:// URL in the free-text message body.
    const urlRegex = /https?:\/\/[^\s"')>]+/g;
    messageContent = messageContent.replace(urlRegex, (url) => {
      try {
        const u = new URL(url);
        // Only decorate our own domains
        if (!u.hostname.endsWith('in-sync.co.in') && !u.hostname.endsWith('insync.co.in')) return url;
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}${utmSuffix}`;
      } catch { return url; }
    });

    const formattedPhone = formatPhoneE164(lead.phone);
    const anonKey    = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const webhookUrl = `${supabaseUrl}/functions/v1/mkt-whatsapp-webhook?apikey=${anonKey}`;

    // Build Exotel content — use template format for approved templates (bypasses 24hr window),
    // fall back to free text only if no approval (only works within 24hr session window).
    let exotelContent: Record<string, unknown>;

    const isApproved =
      templateData &&
      (templateData as Record<string, unknown>).approval_status === 'approved' &&
      (templateData as Record<string, unknown>).template_name;

    if (isApproved) {
      const tpl = templateData as Record<string, unknown>;
      const varNames: string[] = (tpl.variables as string[]) || [];
      const workspaceName = resolveWorkspaceName(tpl.template_name as string);
      const varValueMap: Record<string, string> = {
        first_name:       lead.first_name || 'there',
        last_name:        lead.last_name  || '',
        company:          lead.company    || 'your company',
        job_title:        lead.job_title  || '',
        workspace_name:   workspaceName,
        days_left:        '7',
        days_inactive:    '30',
        feature_name:     'Smart Vendor Verification',
        improvement_stat: '40%',
        new_feature_name: 'Smart Analytics',
      };

      const parameters = varNames.map((name) => ({
        type: 'text',
        text: varValueMap[name] || name,
      }));

      const components: unknown[] = parameters.length > 0
        ? [{ type: 'body', parameters }]
        : [];

      // If the template has a CTA button with a dynamic URL, inject UTM-decorated landing page.
      const tplButtons = (tpl.buttons as Array<{ url?: string }>) || [];
      const buttonUrl: string | null = tplButtons[0]?.url || productUrl;
      if (buttonUrl) {
        try {
          const u = new URL(buttonUrl);
          const sep = buttonUrl.includes('?') ? '&' : '?';
          const decoratedUrl = `${buttonUrl}${sep}${utmSuffix}`;
          // Dynamic URL suffix for Meta call-to-action button (index 0)
          components.push({
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: `${u.search ? '&' : '?'}${utmSuffix}` }],
          });
          void decoratedUrl; // available for logging if needed
        } catch { /* skip if URL invalid */ }
      }

      exotelContent = {
        type: 'template',
        template: {
          name: tpl.template_name,
          language: { code: (tpl.language as string) || 'en' },
          components,
        },
      };
    } else {
      // Free text — only delivers if lead has messaged us in the last 24 hours
      exotelContent = {
        recipient_type: 'individual',
        type: 'text',
        text: { preview_url: false, body: messageContent },
      };
    }

    // Build and send
    const payload = buildExotelPayload({
      sourceNumber: exotelSettings.whatsapp_source_number,
      toNumber: formattedPhone,
      content: exotelContent,
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

/**
 * Infer a human-readable workspace/product name from the template name prefix.
 * Used to fill the {{workspace_name}} variable in welcome templates.
 */
function resolveWorkspaceName(templateName: string): string {
  if (templateName.startsWith('globalcrm')) return 'GlobalCRM';
  if (templateName.startsWith('fieldsync')) return 'Fieldsync';
  if (templateName.startsWith('vendorverification')) return 'VendorVerification';
  if (templateName.startsWith('worksync')) return 'WorkSync';
  return 'In-Sync';
}
