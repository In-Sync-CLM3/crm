import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { updateMemory } from '../_shared/conversationMemory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-product-webhook');

  try {
    const supabase = getSupabaseClient();
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'event';
    const body = await req.json();

    let result: Record<string, unknown> = {};

    switch (action) {
      case 'activation':
        result = await handleActivation(supabase, body, logger);
        break;
      case 'gtm':
        result = await handleGTMEvent(supabase, body, logger);
        break;
      case 'payment':
        result = await handlePayment(supabase, body, logger);
        break;
      case 'trial_signup':
        result = await handleTrialSignup(supabase, body, logger);
        break;
      default:
        result = await handleGenericEvent(supabase, body, logger);
    }

    return new Response(
      JSON.stringify({ received: true, action, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('product-webhook-failed', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ---------------------------------------------------------------------------
// Activation Handler (aha moment)
// ---------------------------------------------------------------------------

async function handleActivation(
  supabase: ReturnType<typeof getSupabaseClient>,
  body: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>
): Promise<Record<string, unknown>> {
  const { email, product_key, org_id, event_name, timestamp } = body as {
    email: string;
    product_key?: string;
    org_id?: string;
    event_name: string;
    timestamp?: string;
  };

  if (!email || !event_name) {
    throw new Error('Missing required fields: email, event_name');
  }

  // Find matching lead
  const { data: lead, error: leadErr } = await supabase
    .from('mkt_leads')
    .select('id, org_id, metadata, first_name')
    .eq('email', email)
    .single();

  if (leadErr || !lead) {
    await logger.warn('activation-lead-not-found', { email });
    return { processed: false, reason: 'lead_not_found' };
  }

  const resolvedOrgId = (org_id as string) || lead.org_id;

  // Store activation state in metadata via jsonb merge
  const existingMetadata = (lead.metadata as Record<string, unknown>) || {};
  const updatedMetadata = {
    ...existingMetadata,
    activated: true,
    activated_at: new Date().toISOString(),
    activation_event: event_name,
    product_key: product_key || existingMetadata.product_key,
  };

  await supabase
    .from('mkt_leads')
    .update({ metadata: updatedMetadata })
    .eq('id', lead.id);

  // Log to mkt_activation_events
  await supabase.from('mkt_activation_events').insert({
    org_id: resolvedOrgId,
    lead_id: lead.id,
    email,
    event_name,
    product_key: product_key || null,
    activated_at: timestamp || new Date().toISOString(),
    metadata: { source: 'product-webhook' },
  });

  // Send congratulatory email via Resend (no sales language)
  await sendResendEmail({
    to: email,
    subject: `You just hit a milestone!`,
    html: buildActivationEmail(lead.first_name as string || 'there', event_name),
  });

  // Update conversation memory
  try {
    await updateMemory(lead.id, resolvedOrgId, 'product', {
      direction: 'inbound',
      summary: `Reached activation milestone: ${event_name}`,
      key_facts: [`Activated via ${event_name}`],
      interests: product_key ? [product_key] : [],
    });
  } catch (memErr) {
    console.error('[mkt-product-webhook] Memory update failed:', memErr);
  }

  await logger.info('activation-processed', {
    lead_id: lead.id,
    event_name,
    product_key,
  });

  return { processed: true, lead_id: lead.id, event: 'activation' };
}

// ---------------------------------------------------------------------------
// GTM / GA4 Event Handler
// ---------------------------------------------------------------------------

async function handleGTMEvent(
  supabase: ReturnType<typeof getSupabaseClient>,
  body: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>
): Promise<Record<string, unknown>> {
  const { email, event_name, page_url, org_id, product_key } = body as {
    email: string;
    event_name: string;
    page_url?: string;
    org_id?: string;
    product_key?: string;
  };

  if (!email || !event_name) {
    throw new Error('Missing required fields: email, event_name');
  }

  // Map to lead
  const { data: lead } = await supabase
    .from('mkt_leads')
    .select('id, org_id, status')
    .eq('email', email)
    .single();

  if (!lead) {
    await logger.warn('gtm-lead-not-found', { email, event_name });
    return { processed: false, reason: 'lead_not_found' };
  }

  const resolvedOrgId = (org_id as string) || lead.org_id;

  // Score deltas by event type
  const scoreMap: Record<string, number> = {
    page_visit: 2,
    pricing_page: 5,
    pricing_page_visit: 5,
    feature_page: 3,
    feature_page_visit: 3,
    docs_visit: 2,
    demo_page_visit: 5,
    blog_visit: 1,
    signup_page_visit: 4,
  };

  const scoreDelta = scoreMap[event_name] || 2;

  // Update engagement score on mkt_lead_scores
  const { data: currentScores } = await supabase
    .from('mkt_lead_scores')
    .select('engagement_score, total_score')
    .eq('lead_id', lead.id)
    .single();

  if (currentScores) {
    const newEngagement = Math.min(30, (currentScores.engagement_score || 0) + scoreDelta);
    const newTotal = (currentScores.total_score || 0) - (currentScores.engagement_score || 0) + newEngagement;

    await supabase
      .from('mkt_lead_scores')
      .update({
        engagement_score: newEngagement,
        total_score: newTotal,
        scored_at: new Date().toISOString(),
      })
      .eq('lead_id', lead.id);

    // Mirror on mkt_leads
    await supabase
      .from('mkt_leads')
      .update({
        engagement_score: newEngagement,
        total_score: newTotal,
      })
      .eq('id', lead.id);

    // Log score history
    await supabase.from('mkt_lead_score_history').insert({
      org_id: resolvedOrgId,
      lead_id: lead.id,
      previous_total: currentScores.total_score,
      new_total: newTotal,
      engagement_delta: scoreDelta,
      reason: `gtm_${event_name}`,
      triggered_by: 'mkt-product-webhook',
    });
  }

  // If pricing page visit and lead is currently 'scored', upgrade to 'engaged'
  const pricingEvents = ['pricing_page', 'pricing_page_visit'];
  if (pricingEvents.includes(event_name) && lead.status === 'scored') {
    await supabase
      .from('mkt_leads')
      .update({ status: 'engaged' })
      .eq('id', lead.id);
  }

  // Log to mkt_engine_logs via the logger
  await logger.info('gtm-event-processed', {
    lead_id: lead.id,
    event_name,
    page_url,
    product_key,
    score_delta: scoreDelta,
  });

  return { processed: true, lead_id: lead.id, score_delta: scoreDelta };
}

// ---------------------------------------------------------------------------
// Payment Handler
// ---------------------------------------------------------------------------

async function handlePayment(
  supabase: ReturnType<typeof getSupabaseClient>,
  body: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>
): Promise<Record<string, unknown>> {
  const { email, org_id, product_key, amount_paise, contact_id } = body as {
    email: string;
    org_id?: string;
    product_key?: string;
    amount_paise: number;
    contact_id?: string;
  };

  if (!email || !amount_paise) {
    throw new Error('Missing required fields: email, amount_paise');
  }

  // Find matching lead
  const { data: lead } = await supabase
    .from('mkt_leads')
    .select('id, org_id, first_name, metadata')
    .eq('email', email)
    .single();

  if (!lead) {
    await logger.warn('payment-lead-not-found', { email });
    return { processed: false, reason: 'lead_not_found' };
  }

  const resolvedOrgId = (org_id as string) || lead.org_id;

  // Mark lead as converted
  await supabase
    .from('mkt_leads')
    .update({
      status: 'converted',
      converted_at: new Date().toISOString(),
    })
    .eq('id', lead.id);

  // Cancel all active enrollments
  await supabase
    .from('mkt_sequence_enrollments')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: 'Lead converted (payment received)',
    })
    .eq('lead_id', lead.id)
    .eq('status', 'active');

  // Generate referral code (random 8-char alphanumeric)
  const referralCode = generateReferralCode();

  // Store referral code in metadata
  const existingMetadata = (lead.metadata as Record<string, unknown>) || {};
  await supabase
    .from('mkt_leads')
    .update({
      metadata: {
        ...existingMetadata,
        referral_code: referralCode,
        converted_amount_paise: amount_paise,
        converted_product: product_key || null,
        contact_id: contact_id || existingMetadata.contact_id,
      },
    })
    .eq('id', lead.id);

  // Create mkt_mrr record
  const amountRupees = amount_paise / 100;
  await supabase.from('mkt_mrr').insert({
    org_id: resolvedOrgId,
    lead_id: lead.id,
    email,
    product_key: product_key || null,
    amount_paise,
    amount: amountRupees,
    currency: 'INR',
    referral_code: referralCode,
    started_at: new Date().toISOString(),
    status: 'active',
  });

  // Update conversation memory
  try {
    await updateMemory(lead.id, resolvedOrgId, 'payment', {
      direction: 'inbound',
      summary: `Converted! Payment of ${amountRupees} INR received${product_key ? ` for ${product_key}` : ''}`,
      key_facts: [`Converted customer`, `Payment: ${amountRupees} INR`, `Referral code: ${referralCode}`],
    });
  } catch (memErr) {
    console.error('[mkt-product-webhook] Memory update failed:', memErr);
  }

  // Send confirmation email
  await sendResendEmail({
    to: email,
    subject: 'Payment confirmed — welcome aboard!',
    html: buildPaymentConfirmationEmail(
      lead.first_name as string || 'there',
      amountRupees,
      referralCode
    ),
  });

  await logger.info('payment-processed', {
    lead_id: lead.id,
    amount_paise,
    product_key,
    referral_code: referralCode,
  });

  return {
    processed: true,
    lead_id: lead.id,
    referral_code: referralCode,
    amount: amountRupees,
  };
}

// ---------------------------------------------------------------------------
// Trial Signup Handler
// ---------------------------------------------------------------------------

async function handleTrialSignup(
  supabase: ReturnType<typeof getSupabaseClient>,
  body: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>
): Promise<Record<string, unknown>> {
  const { email, first_name, last_name, company, org_id, product_key } = body as {
    email: string;
    first_name?: string;
    last_name?: string;
    company?: string;
    org_id: string;
    product_key?: string;
  };

  if (!email || !org_id) {
    throw new Error('Missing required fields: email, org_id');
  }

  // Check if lead already exists
  const { data: existingLead } = await supabase
    .from('mkt_leads')
    .select('id, status')
    .eq('email', email)
    .single();

  let leadId: string;

  if (existingLead) {
    // Update existing lead to trial status (only if not already converted)
    if (existingLead.status !== 'converted') {
      await supabase
        .from('mkt_leads')
        .update({
          status: 'trial',
          first_name: first_name || undefined,
          last_name: last_name || undefined,
          company: company || undefined,
          metadata: {
            product_key: product_key || null,
            trial_started_at: new Date().toISOString(),
          },
        })
        .eq('id', existingLead.id);
    }
    leadId = existingLead.id;
  } else {
    // Create new lead
    const { data: newLead, error: insertErr } = await supabase
      .from('mkt_leads')
      .insert({
        org_id,
        email,
        first_name: first_name || null,
        last_name: last_name || null,
        company: company || null,
        source: 'product_trial',
        status: 'trial',
        metadata: {
          product_key: product_key || null,
          trial_started_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single();

    if (insertErr || !newLead) {
      throw new Error(`Failed to create lead: ${insertErr?.message || 'unknown'}`);
    }

    leadId = newLead.id;
  }

  // Trigger lead scoring via mkt-lead-scorer
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseKey) {
      await fetch(`${supabaseUrl}/functions/v1/mkt-lead-scorer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ lead_id: leadId, org_id }),
      });
    }
  } catch (scoreErr) {
    console.error('[mkt-product-webhook] Lead scorer trigger failed:', scoreErr);
  }

  await logger.info('trial-signup-processed', {
    lead_id: leadId,
    email,
    product_key,
    is_new: !existingLead,
  });

  return {
    processed: true,
    lead_id: leadId,
    is_new_lead: !existingLead,
  };
}

// ---------------------------------------------------------------------------
// Generic Event Handler (fallback)
// ---------------------------------------------------------------------------

async function handleGenericEvent(
  supabase: ReturnType<typeof getSupabaseClient>,
  body: Record<string, unknown>,
  logger: ReturnType<typeof createEngineLogger>
): Promise<Record<string, unknown>> {
  const email = body.email as string | undefined;

  if (email) {
    const { data: lead } = await supabase
      .from('mkt_leads')
      .select('id, org_id')
      .eq('email', email)
      .single();

    if (lead) {
      await logger.info('generic-event', {
        lead_id: lead.id,
        event: body,
      });
      return { processed: true, lead_id: lead.id };
    }
  }

  await logger.info('generic-event-no-lead', { event: body });
  return { processed: true, matched_lead: false };
}

// ---------------------------------------------------------------------------
// Resend Email Helper
// ---------------------------------------------------------------------------

interface ResendEmailParams {
  to: string;
  subject: string;
  html: string;
}

async function sendResendEmail(params: ResendEmailParams): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('[mkt-product-webhook] RESEND_API_KEY not set, skipping email');
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM_EMAIL') || 'notifications@updates.yourdomain.com',
        to: params.to,
        subject: params.subject,
        html: params.html,
        tags: [{ name: 'mkt_engine' }, { name: 'product-webhook' }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[mkt-product-webhook] Resend API error:', response.status, errBody);
    }
  } catch (error) {
    console.error('[mkt-product-webhook] Email send failed:', error);
  }
}

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------

function buildActivationEmail(firstName: string, eventName: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
      <h2 style="color: #111827; font-size: 22px; margin-bottom: 12px;">
        Congrats, ${firstName}!
      </h2>
      <p style="color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        You just completed <strong>${eventName}</strong> — that's a great milestone.
      </p>
      <p style="color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        Here's what you can do next:
      </p>
      <ul style="color: #374151; font-size: 15px; line-height: 1.8; padding-left: 20px; margin-bottom: 24px;">
        <li>Explore advanced features in your dashboard</li>
        <li>Check out our guides for tips and best practices</li>
        <li>Reach out if you have any questions — we're here to help</li>
      </ul>
      <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">
        Keep going — you're on the right track.
      </p>
    </div>
  `;
}

function buildPaymentConfirmationEmail(
  firstName: string,
  amountRupees: number,
  referralCode: string
): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
      <h2 style="color: #111827; font-size: 22px; margin-bottom: 12px;">
        Payment confirmed!
      </h2>
      <p style="color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        Hi ${firstName}, we've received your payment of <strong>${amountRupees.toLocaleString('en-IN')} INR</strong>. Welcome aboard!
      </p>
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <p style="color: #374151; font-size: 14px; margin: 0 0 4px 0;">Your referral code:</p>
        <p style="color: #111827; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: 1px;">${referralCode}</p>
        <p style="color: #6b7280; font-size: 12px; margin: 8px 0 0 0;">Share this with friends to earn rewards.</p>
      </div>
      <p style="color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        If you have any questions about your account, reply to this email or check our help center.
      </p>
      <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">
        Thank you for your trust.
      </p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  for (let i = 0; i < 8; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}
