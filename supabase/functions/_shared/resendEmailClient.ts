/**
 * Shared Resend email sending utility.
 * Used by: send-email, mkt-send-email, send-bulk-email, send-subscription-email
 */

export interface ResendEmailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  reply_to?: string[];
  cc?: string[];
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

export interface ResendResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an email via the Resend API.
 */
export async function sendViaResend(payload: ResendEmailPayload): Promise<ResendResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok) {
    return { success: false, error: result?.message || result?.error || `Resend error ${response.status}` };
  }

  return { success: true, id: result.id };
}

/**
 * Build the "from" address string: "Name <email>"
 */
export function buildFromAddress(name: string, email: string): string {
  return `${name} <${email}>`;
}

/**
 * Inject an unsubscribe footer into HTML email content.
 * Inserts before </body> or appends to end.
 */
export function buildUnsubscribeFooter(unsubscribeUrl: string): string {
  return `
    <div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">
      <p style="font-size:12px;color:#6b7280;">
        <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
        from these emails.
      </p>
    </div>`;
}

/**
 * Inject content (footer, pixel) before </body> or append to end.
 */
export function injectBeforeBodyClose(html: string, content: string): string {
  if (html.includes('</body>')) {
    return html.replace('</body>', `${content}</body>`);
  }
  return html + content;
}

/**
 * Build a 1x1 tracking pixel img tag.
 */
export function injectTrackingPixel(trackingUrl: string): string {
  return `<img src="${trackingUrl}" width="1" height="1" style="display:none" alt="" />`;
}

/**
 * Build RFC 8058 List-Unsubscribe headers.
 */
export function buildUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
