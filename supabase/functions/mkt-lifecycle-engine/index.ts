import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SupabaseClient = ReturnType<typeof getSupabaseClient>;
type Logger = ReturnType<typeof createEngineLogger>;

// ---------------------------------------------------------------------------
// WhatsApp helper — mirrors mkt-send-whatsapp Exotel pattern exactly
// ---------------------------------------------------------------------------
async function sendWhatsApp(
  supabase: SupabaseClient,
  orgId: string,
  phone: string,
  messageText: string,
  logger: Logger,
): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  // Fetch Exotel settings
  const { data: exotelSettings } = await supabase
    .from('exotel_settings')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .eq('whatsapp_enabled', true)
    .single();

  if (!exotelSettings) return { success: false, error: 'WhatsApp not configured for org' };
  if (!exotelSettings.whatsapp_source_number) return { success: false, error: 'No WhatsApp source number' };

  // Format phone to E.164
  let formattedPhone = phone.replace(/[^\d+]/g, '');
  if (!formattedPhone.startsWith('+')) {
    if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
      formattedPhone = '+91' + formattedPhone;
    } else {
      formattedPhone = '+' + formattedPhone;
    }
  }

  // Build Exotel request — Basic Auth with btoa(), text content type
  const exApiKey = exotelSettings.api_key;
  const exApiToken = exotelSettings.api_token;
  const exSubdomain = exotelSettings.subdomain;
  const exSid = exotelSettings.account_sid;
  const exotelUrl = `https://${exSubdomain}/v2/accounts/${exSid}/messages`;
  const basicAuth = btoa(`${exApiKey}:${exApiToken}`);

  const exotelPayload = {
    whatsapp: {
      messages: [
        {
          from: exotelSettings.whatsapp_source_number,
          to: formattedPhone,
          content: {
            recipient_type: 'individual',
            type: 'text',
            text: { preview_url: false, body: messageText },
          },
        },
      ],
    },
  };

  const exotelResponse = await fetch(exotelUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: JSON.stringify(exotelPayload),
  });

  const exotelText = await exotelResponse.text();
  if (!exotelText) return { success: false, error: `Empty response (${exotelResponse.status})` };

  let exotelResult: Record<string, unknown>;
  try {
    exotelResult = JSON.parse(exotelText);
  } catch {
    return { success: false, error: `Non-JSON response: ${exotelText.substring(0, 200)}` };
  }

  const messageResponse = (exotelResult?.response as Record<string, unknown>)?.whatsapp as Record<string, unknown>;
  const firstMessage = (messageResponse?.messages as Array<Record<string, unknown>>)?.[0];
  const isSuccess = exotelResponse.ok && (firstMessage?.code === 200 || firstMessage?.code === 202);

  if (!isSuccess) {
    const errorMsg = (firstMessage?.error_data as Record<string, unknown>)?.message
      || exotelResult?.message || JSON.stringify(exotelResult);
    return { success: false, error: `Exotel error: ${errorMsg}` };
  }

  const messageSid = (firstMessage?.data as Record<string, unknown>)?.sid as string;
  return { success: true, messageSid };
}

// ---------------------------------------------------------------------------
// Email helper — mirrors mkt-send-email Resend API pattern
// ---------------------------------------------------------------------------
async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  _logger: Logger,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) return { success: false, error: 'RESEND_API_KEY not configured' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'In-Sync Team <hello@in-sync.co.in>',
      to: [to],
      subject,
      html: htmlBody,
      reply_to: 'hello@in-sync.co.in',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { success: false, error: `Resend ${response.status}: ${errText}` };
  }

  const result = await response.json();
  return { success: true, messageId: result.id };
}

// ---------------------------------------------------------------------------
// NPS handler
// ---------------------------------------------------------------------------
async function handleNPS(
  supabase: SupabaseClient,
  orgId: string,
  logger: Logger,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const thirtyFiveDaysAgo = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString();
  const twentyFiveDaysAgo = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString();

  // Find converted leads where converted_at is 25-35 days ago
  const { data: leads, error: leadsErr } = await supabase
    .from('mkt_leads')
    .select('id, first_name, phone, contact_id')
    .eq('org_id', orgId)
    .eq('status', 'converted')
    .gte('converted_at', thirtyFiveDaysAgo)
    .lte('converted_at', twentyFiveDaysAgo)
    .not('phone', 'is', null);

  if (leadsErr) throw new Error(`NPS lead query failed: ${leadsErr.message}`);
  if (!leads || leads.length === 0) {
    await logger.info('nps-no-eligible-leads', { org_id: orgId });
    return { sent: 0, skipped: 0 };
  }

  // Filter out leads that already have 2+ NPS responses this billing cycle
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const leadIds = leads.map((l) => l.id);

  const { data: existingNps } = await supabase
    .from('mkt_nps_responses')
    .select('lead_id')
    .in('lead_id', leadIds)
    .gte('created_at', startOfMonth);

  // Count NPS per lead
  const npsCounts: Record<string, number> = {};
  for (const row of existingNps || []) {
    npsCounts[row.lead_id] = (npsCounts[row.lead_id] || 0) + 1;
  }

  // Respect 72-hour WhatsApp cooldown
  const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
  const { data: recentMessages } = await supabase
    .from('mkt_nps_responses')
    .select('lead_id')
    .in('lead_id', leadIds)
    .gte('sent_at', seventyTwoHoursAgo);

  const recentlySent = new Set((recentMessages || []).map((r) => r.lead_id));

  const eligible = leads.filter((l) => {
    if ((npsCounts[l.id] || 0) >= 2) return false; // Max 2 per cycle
    if (recentlySent.has(l.id)) return false; // 72-hour cooldown
    return true;
  });

  let sent = 0;
  let skipped = 0;

  for (const lead of eligible) {
    const name = lead.first_name || 'there';
    const message = `Hi ${name}, on a scale of 1-5, how satisfied are you with In-Sync? Reply with a number.`;

    const result = await sendWhatsApp(supabase, orgId, lead.phone, message, logger);

    if (result.success) {
      await supabase.from('mkt_nps_responses').insert({
        org_id: orgId,
        lead_id: lead.id,
        contact_id: lead.contact_id || null,
        sent_at: now.toISOString(),
        channel: 'whatsapp',
        message_sid: result.messageSid,
      });
      sent++;
    } else {
      await logger.warn('nps-send-failed', { lead_id: lead.id, error: result.error });
      skipped++;
    }
  }

  await logger.info('nps-complete', { org_id: orgId, sent, skipped, total_eligible: eligible.length });
  return { sent, skipped, total_eligible: eligible.length };
}

// ---------------------------------------------------------------------------
// Cross-sell handler
// ---------------------------------------------------------------------------
async function handleCrossSell(
  supabase: SupabaseClient,
  orgId: string,
  logger: Logger,
): Promise<Record<string, unknown>> {
  // Fetch holdoff days from config (default 30)
  const { data: configRow } = await supabase
    .from('mkt_engine_config')
    .select('config_value')
    .eq('org_id', orgId)
    .eq('config_key', 'crosssell_holdoff_days')
    .single();

  const holdoffDays = (configRow?.config_value as number) || 30;
  const now = new Date();
  const cutoff = new Date(now.getTime() - holdoffDays * 24 * 60 * 60 * 1000).toISOString();

  // Find converted leads past holdoff period
  const { data: leads, error: leadsErr } = await supabase
    .from('mkt_leads')
    .select('id, first_name, phone, contact_id, email')
    .eq('org_id', orgId)
    .eq('status', 'converted')
    .lte('converted_at', cutoff)
    .not('phone', 'is', null);

  if (leadsErr) throw new Error(`Cross-sell lead query failed: ${leadsErr.message}`);
  if (!leads || leads.length === 0) {
    await logger.info('crosssell-no-eligible-leads', { org_id: orgId });
    return { sent: 0, skipped: 0 };
  }

  // Check which leads already received a cross-sell in the last 45 days
  const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentCrossSells } = await supabase
    .from('mkt_engine_logs')
    .select('details')
    .eq('org_id', orgId)
    .eq('action', 'crosssell-sent')
    .gte('created_at', fortyFiveDaysAgo);

  const recentlyCrossSold = new Set<string>();
  for (const log of recentCrossSells || []) {
    const leadId = (log.details as Record<string, unknown>)?.lead_id as string;
    if (leadId) recentlyCrossSold.add(leadId);
  }

  // Fetch all products
  const { data: allProducts } = await supabase
    .from('mkt_products')
    .select('id, name, description')
    .eq('org_id', orgId)
    .eq('is_active', true);

  // Fetch cross-sell pairs
  const { data: crossSellPairs } = await supabase
    .from('mkt_crosssell_pairs')
    .select('source_product_id, target_product_id, priority')
    .eq('org_id', orgId)
    .order('priority', { ascending: false });

  let sent = 0;
  let skipped = 0;

  for (const lead of leads) {
    if (recentlyCrossSold.has(lead.id)) { skipped++; continue; }

    // Get products this lead already has
    const { data: leadProducts } = await supabase
      .from('mkt_lead_products')
      .select('product_id')
      .eq('lead_id', lead.id);

    const ownedProductIds = new Set((leadProducts || []).map((p) => p.product_id));

    // Find best target product from cross-sell pairs
    let targetProduct: Record<string, unknown> | null = null;

    for (const pair of crossSellPairs || []) {
      if (ownedProductIds.has(pair.source_product_id) && !ownedProductIds.has(pair.target_product_id)) {
        targetProduct = (allProducts || []).find((p) => p.id === pair.target_product_id) || null;
        if (targetProduct) break;
      }
    }

    // Fallback: pick any product they don't own
    if (!targetProduct && allProducts) {
      targetProduct = allProducts.find((p) => !ownedProductIds.has(p.id)) || null;
    }

    if (!targetProduct) { skipped++; continue; }

    const name = lead.first_name || 'there';
    const productName = targetProduct.name as string;
    const message = `Hi ${name}, since you're already using In-Sync, we thought you'd love ${productName}. Want to know more? Reply YES for details.`;

    const result = await sendWhatsApp(supabase, orgId, lead.phone, message, logger);

    if (result.success) {
      await logger.info('crosssell-sent', {
        lead_id: lead.id,
        product_id: targetProduct.id,
        product_name: productName,
      });
      sent++;
    } else {
      await logger.warn('crosssell-send-failed', { lead_id: lead.id, error: result.error });
      skipped++;
    }
  }

  await logger.info('crosssell-complete', { org_id: orgId, sent, skipped });
  return { sent, skipped };
}

// ---------------------------------------------------------------------------
// Upsell handler
// ---------------------------------------------------------------------------
async function handleUpsell(
  supabase: SupabaseClient,
  orgId: string,
  logger: Logger,
): Promise<Record<string, unknown>> {
  // Find leads with high engagement scores (>80) on current product
  const { data: leads, error: leadsErr } = await supabase
    .from('mkt_leads')
    .select('id, first_name, phone, email, contact_id, engagement_score, current_product')
    .eq('org_id', orgId)
    .eq('status', 'converted')
    .gt('engagement_score', 80)
    .not('phone', 'is', null);

  if (leadsErr) throw new Error(`Upsell lead query failed: ${leadsErr.message}`);
  if (!leads || leads.length === 0) {
    await logger.info('upsell-no-eligible-leads', { org_id: orgId });
    return { sent: 0, skipped: 0 };
  }

  // Check which leads already received an upsell in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentUpsells } = await supabase
    .from('mkt_engine_logs')
    .select('details')
    .eq('org_id', orgId)
    .eq('action', 'upsell-sent')
    .gte('created_at', thirtyDaysAgo);

  const recentlyUpsold = new Set<string>();
  for (const log of recentUpsells || []) {
    const leadId = (log.details as Record<string, unknown>)?.lead_id as string;
    if (leadId) recentlyUpsold.add(leadId);
  }

  let sent = 0;
  let skipped = 0;

  for (const lead of leads) {
    if (recentlyUpsold.has(lead.id)) { skipped++; continue; }

    const name = lead.first_name || 'there';
    const product = (lead.current_product as string) || 'your current plan';

    // Send via WhatsApp if phone available
    if (lead.phone) {
      const message = `Hi ${name}, you're getting great value from ${product}! We have an upgraded plan with more capacity that could be perfect for your growing usage. Reply UPGRADE for details.`;
      const waResult = await sendWhatsApp(supabase, orgId, lead.phone, message, logger);

      if (waResult.success) {
        await logger.info('upsell-sent', {
          lead_id: lead.id,
          channel: 'whatsapp',
          engagement_score: lead.engagement_score,
        });
        sent++;
        continue;
      }
    }

    // Fallback to email if phone failed or not available
    if (lead.email) {
      const subject = `${name}, you're ready for more`;
      const html = `
        <html><body>
          <p>Hi ${name},</p>
          <p>We've noticed you're making great use of <strong>${product}</strong> with an engagement score of ${lead.engagement_score}.</p>
          <p>Our upgraded plan offers more capacity and premium features that match your growing usage pattern. Here's what you'd get:</p>
          <ul>
            <li>Higher usage limits</li>
            <li>Priority support</li>
            <li>Advanced analytics</li>
          </ul>
          <p>Reply to this email or reach out to discuss your upgrade options.</p>
          <p>Best,<br/>The In-Sync Team</p>
        </body></html>`;

      const emailResult = await sendEmail(lead.email, subject, html, logger);

      if (emailResult.success) {
        await logger.info('upsell-sent', {
          lead_id: lead.id,
          channel: 'email',
          engagement_score: lead.engagement_score,
        });
        sent++;
        continue;
      }
    }

    await logger.warn('upsell-no-channel', { lead_id: lead.id });
    skipped++;
  }

  await logger.info('upsell-complete', { org_id: orgId, sent, skipped });
  return { sent, skipped };
}

// ---------------------------------------------------------------------------
// Dunning (win-back) handler
// ---------------------------------------------------------------------------
async function handleDunning(
  supabase: SupabaseClient,
  orgId: string,
  logger: Logger,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Find churned/dead leads from 7-30 days ago
  const { data: leads, error: leadsErr } = await supabase
    .from('mkt_leads')
    .select('id, first_name, email, phone, contact_id, churned_at')
    .eq('org_id', orgId)
    .in('status', ['churned', 'dead'])
    .gte('churned_at', thirtyDaysAgo)
    .lte('churned_at', sevenDaysAgo)
    .not('email', 'is', null);

  if (leadsErr) throw new Error(`Dunning lead query failed: ${leadsErr.message}`);
  if (!leads || leads.length === 0) {
    await logger.info('dunning-no-eligible-leads', { org_id: orgId });
    return { sent: 0, skipped: 0 };
  }

  // Check existing dunning sequences to avoid duplicates
  const leadIds = leads.map((l) => l.id);
  const { data: existingDunning } = await supabase
    .from('mkt_engine_logs')
    .select('details')
    .eq('org_id', orgId)
    .eq('action', 'dunning-email-1-sent')
    .gte('created_at', thirtyDaysAgo);

  const alreadyDunned = new Set<string>();
  for (const log of existingDunning || []) {
    const leadId = (log.details as Record<string, unknown>)?.lead_id as string;
    if (leadId) alreadyDunned.add(leadId);
  }

  let sent = 0;
  let skipped = 0;

  // Determine which email to send based on days since churn
  for (const lead of leads) {
    if (alreadyDunned.has(lead.id)) {
      // Check which email stage they're at
      const daysSinceChurn = Math.floor(
        (now.getTime() - new Date(lead.churned_at as string).getTime()) / (24 * 60 * 60 * 1000)
      );

      // Email 1: day 7, Email 2: day 17, Email 3: day 27
      let emailStage = 0;
      if (daysSinceChurn >= 27) emailStage = 3;
      else if (daysSinceChurn >= 17) emailStage = 2;
      else emailStage = 1; // Already sent email 1, skip until day 17

      // Check if this stage email was already sent for this specific lead
      const { data: stageLogs } = await supabase
        .from('mkt_engine_logs')
        .select('details')
        .eq('org_id', orgId)
        .eq('action', `dunning-email-${emailStage}-sent`)
        .gte('created_at', thirtyDaysAgo);

      const stageAlreadySent = (stageLogs || []).some((log) =>
        (log.details as Record<string, unknown>)?.lead_id === lead.id
      );

      if (emailStage <= 1 || stageAlreadySent) { skipped++; continue; }
    }

    const name = lead.first_name || 'there';
    const daysSinceChurn = Math.floor(
      (now.getTime() - new Date(lead.churned_at as string).getTime()) / (24 * 60 * 60 * 1000)
    );

    let emailNum = 1;
    let subject = '';
    let html = '';

    if (daysSinceChurn >= 27) {
      emailNum = 3;
      subject = `Last chance: Special offer inside, ${name}`;
      html = `
        <html><body>
          <p>Hi ${name},</p>
          <p>This is our final reach-out. We'd love to have you back, and we're offering a special 20% discount on your first month back.</p>
          <p>Use code <strong>COMEBACK20</strong> when you re-activate.</p>
          <p>If you've moved on, no hard feelings — we wish you the best!</p>
          <p>Warm regards,<br/>The In-Sync Team</p>
        </body></html>`;
    } else if (daysSinceChurn >= 17) {
      emailNum = 2;
      subject = `Here's what you're missing, ${name}`;
      html = `
        <html><body>
          <p>Hi ${name},</p>
          <p>Since you left, we've been busy improving In-Sync. Here's what's new:</p>
          <ul>
            <li>Faster performance</li>
            <li>New integrations</li>
            <li>Improved dashboard</li>
          </ul>
          <p>We'd love to show you around. Reply to schedule a quick walkthrough.</p>
          <p>Best,<br/>The In-Sync Team</p>
        </body></html>`;
    } else {
      emailNum = 1;
      subject = `We miss you, ${name}`;
      html = `
        <html><body>
          <p>Hi ${name},</p>
          <p>We noticed you're no longer using In-Sync, and we wanted to check in.</p>
          <p>If there's anything we could have done better, we'd love to hear about it. And if you'd like to give us another try, we have a special offer just for you.</p>
          <p>Reply to this email and we'll set you up with a personalized plan.</p>
          <p>Best regards,<br/>The In-Sync Team</p>
        </body></html>`;
    }

    const emailResult = await sendEmail(lead.email, subject, html, logger);

    if (emailResult.success) {
      await logger.info(`dunning-email-${emailNum}-sent`, {
        lead_id: lead.id,
        email_num: emailNum,
        days_since_churn: daysSinceChurn,
        message_id: emailResult.messageId,
      });
      sent++;
    } else {
      await logger.warn('dunning-send-failed', { lead_id: lead.id, error: emailResult.error });
      skipped++;
    }
  }

  await logger.info('dunning-complete', { org_id: orgId, sent, skipped });
  return { sent, skipped };
}

// ---------------------------------------------------------------------------
// Referral handler
// ---------------------------------------------------------------------------
async function handleReferral(
  supabase: SupabaseClient,
  orgId: string,
  body: Record<string, unknown>,
  logger: Logger,
): Promise<Record<string, unknown>> {
  const leadId = body.lead_id as string;
  const referrerId = body.referrer_id as string | undefined;

  // If referrer_id is provided, this is a referred conversion — apply rewards
  if (referrerId) {
    return await applyReferralReward(supabase, orgId, leadId, referrerId, logger);
  }

  // Otherwise generate a referral code for the lead
  if (!leadId) throw new Error('lead_id required for referral mode');

  const { data: lead, error: leadErr } = await supabase
    .from('mkt_leads')
    .select('id, first_name, referral_code')
    .eq('id', leadId)
    .eq('org_id', orgId)
    .single();

  if (leadErr || !lead) throw new Error(`Lead not found: ${leadId}`);

  // Return existing code if already generated
  if (lead.referral_code) {
    const referralLink = `https://in-sync.co.in/refer?code=${lead.referral_code}`;
    return { referral_code: lead.referral_code, referral_link: referralLink, existing: true };
  }

  // Generate a unique referral code
  const prefix = (lead.first_name || 'REF').substring(0, 4).toUpperCase();
  const randomPart = crypto.randomUUID().substring(0, 6).toUpperCase();
  const referralCode = `${prefix}-${randomPart}`;

  const { error: updateErr } = await supabase
    .from('mkt_leads')
    .update({ referral_code: referralCode })
    .eq('id', leadId);

  if (updateErr) throw new Error(`Failed to save referral code: ${updateErr.message}`);

  const referralLink = `https://in-sync.co.in/refer?code=${referralCode}`;

  await logger.info('referral-code-generated', {
    lead_id: leadId,
    referral_code: referralCode,
  });

  return { referral_code: referralCode, referral_link: referralLink, existing: false };
}

async function applyReferralReward(
  supabase: SupabaseClient,
  orgId: string,
  newLeadId: string,
  referrerId: string,
  logger: Logger,
): Promise<Record<string, unknown>> {
  // Apply Rs 500 credit to referrer
  const { error: creditErr } = await supabase
    .from('mkt_leads')
    .update({
      referral_credit: 500,
      referral_credit_applied_at: new Date().toISOString(),
    })
    .eq('id', referrerId)
    .eq('org_id', orgId);

  if (creditErr) {
    await logger.warn('referral-credit-failed', { referrer_id: referrerId, error: creditErr.message });
  }

  // Apply 30-day extended trial for the referred friend
  const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: trialErr } = await supabase
    .from('mkt_leads')
    .update({
      trial_end_date: trialEnd,
      referred_by: referrerId,
    })
    .eq('id', newLeadId)
    .eq('org_id', orgId);

  if (trialErr) {
    await logger.warn('referral-trial-failed', { lead_id: newLeadId, error: trialErr.message });
  }

  await logger.info('referral-reward-applied', {
    referrer_id: referrerId,
    new_lead_id: newLeadId,
    credit_amount: 500,
    trial_days: 30,
  });

  return {
    referrer_id: referrerId,
    new_lead_id: newLeadId,
    credit_applied: !creditErr ? 500 : 0,
    trial_end: !trialErr ? trialEnd : null,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-lifecycle-engine');

  try {
    const supabase = getSupabaseClient();
    const body = await req.json();
    const mode = body.mode; // nps | crosssell | upsell | dunning | referral
    const orgId = body.org_id;

    if (!orgId) throw new Error('org_id required');

    let result: Record<string, unknown> = {};

    switch (mode) {
      case 'nps':
        result = await handleNPS(supabase, orgId, logger);
        break;
      case 'crosssell':
        result = await handleCrossSell(supabase, orgId, logger);
        break;
      case 'upsell':
        result = await handleUpsell(supabase, orgId, logger);
        break;
      case 'dunning':
        result = await handleDunning(supabase, orgId, logger);
        break;
      case 'referral':
        result = await handleReferral(supabase, orgId, body, logger);
        break;
      default:
        throw new Error(`Unknown mode: ${mode}`);
    }

    return new Response(
      JSON.stringify({ success: true, mode, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('lifecycle-engine-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
