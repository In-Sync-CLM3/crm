import { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';

export interface ExotelWhatsAppSettings {
  api_key: string;
  api_token: string;
  subdomain: string;
  account_sid: string;
  whatsapp_source_number: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  statusCode: number;
}

/**
 * Format a phone number to E.164 format.
 * Assumes Indian numbers when no country code is present.
 */
export function formatPhoneE164(phone: string): string {
  let formatted = phone.replace(/[^\d+]/g, '');
  if (!formatted.startsWith('+')) {
    if (!formatted.startsWith('91') && formatted.length === 10) {
      formatted = '+91' + formatted;
    } else {
      formatted = '+' + formatted;
    }
  }
  return formatted;
}

/**
 * Build the Exotel WhatsApp API payload.
 */
export function buildExotelPayload(opts: {
  sourceNumber: string;
  toNumber: string;
  content: Record<string, unknown>;
  customData?: string;
  statusCallback?: string;
}): Record<string, unknown> {
  return {
    custom_data: opts.customData,
    status_callback: opts.statusCallback,
    whatsapp: {
      messages: [
        {
          from: opts.sourceNumber,
          to: opts.toNumber,
          content: opts.content,
        },
      ],
    },
  };
}

/**
 * Send a WhatsApp message via the Exotel API.
 * Returns parsed result with success status and message SID.
 */
export async function sendViaExotel(
  settings: ExotelWhatsAppSettings,
  payload: Record<string, unknown>
): Promise<WhatsAppSendResult> {
  const exotelUrl = `https://${settings.subdomain}/v2/accounts/${settings.account_sid}/messages`;
  const basicAuth = btoa(`${settings.api_key}:${settings.api_token}`);

  const response = await fetch(exotelUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!text) {
    return { success: false, error: `Empty response (status ${response.status})`, statusCode: response.status };
  }

  let result: Record<string, any>;
  try {
    result = JSON.parse(text);
  } catch {
    return { success: false, error: `Non-JSON response: ${text.substring(0, 200)}`, statusCode: response.status };
  }

  const messageResponse = result?.response?.whatsapp?.messages?.[0];
  const isSuccess = response.ok && (messageResponse?.code === 200 || messageResponse?.code === 202);

  if (!isSuccess) {
    const errorMsg = messageResponse?.error_data?.message || result?.message || JSON.stringify(result);
    return { success: false, error: String(errorMsg), statusCode: messageResponse?.code || response.status };
  }

  return {
    success: true,
    messageSid: messageResponse?.data?.sid,
    statusCode: messageResponse?.code || 200,
  };
}

/**
 * Fetch active WhatsApp-enabled Exotel settings for an org.
 */
export async function getWhatsAppSettings(
  supabase: SupabaseClient,
  orgId: string
): Promise<ExotelWhatsAppSettings | null> {
  const { data } = await supabase
    .from('exotel_settings')
    .select('api_key, api_token, subdomain, account_sid, whatsapp_source_number')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .eq('whatsapp_enabled', true)
    .single();

  return data as ExotelWhatsAppSettings | null;
}
