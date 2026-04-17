import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConvertRequest {
  lead_id?: string;
  org_id?: string;
  score_threshold?: number;
  auto_enroll?: boolean; // Auto-enroll converted leads in campaign sequence
  batch?: boolean; // Process all qualifying leads for an org
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-convert-lead');

  try {
    const supabase = getSupabaseClient();

    let body: ConvertRequest = {};
    try {
      body = await req.json();
    } catch {
      // Empty body — nothing to do without parameters
      return new Response(
        JSON.stringify({ error: 'Request body required with lead_id or org_id+batch' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve conversion threshold — single source of truth in mkt_engine_config
    let conversionMin = 70; // fallback if config row is missing
    if (body.org_id) {
      const { data: thresholdsRow } = await supabase
        .from('mkt_engine_config')
        .select('config_value')
        .eq('org_id', body.org_id)
        .eq('config_key', 'score_thresholds')
        .maybeSingle();
      conversionMin = (thresholdsRow?.config_value as Record<string, number> | null)?.conversion_min ?? 70;
    }
    const threshold = body.score_threshold ?? conversionMin;
    const autoEnroll = body.auto_enroll !== false; // Default true

    let leadsToConvert: Array<Record<string, unknown>> = [];

    if (body.lead_id) {
      // Single lead conversion
      const { data: lead, error } = await supabase
        .from('mkt_leads')
        .select('*')
        .eq('id', body.lead_id)
        .single();

      if (error || !lead) {
        return new Response(
          JSON.stringify({ error: 'Lead not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (lead.status === 'converted') {
        return new Response(
          JSON.stringify({ message: 'Lead already converted', contact_id: lead.contact_id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      leadsToConvert = [lead];
    } else if (body.org_id && body.batch) {
      // Batch conversion — all qualifying leads for an org
      const { data: leads, error } = await supabase
        .from('mkt_leads')
        .select('*')
        .eq('org_id', body.org_id)
        .in('status', ['scored', 'enriched'])
        .gte('total_score', threshold)
        .is('contact_id', null)
        .order('total_score', { ascending: false })
        .limit(100);

      if (error) throw error;
      leadsToConvert = leads || [];
    } else {
      return new Response(
        JSON.stringify({ error: 'Provide lead_id for single conversion, or org_id+batch for batch' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (leadsToConvert.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No leads qualifying for conversion', threshold }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logger.info('conversion-start', {
      lead_count: leadsToConvert.length,
      threshold,
      mode: body.lead_id ? 'single' : 'batch',
    });

    let converted = 0;
    let failed = 0;
    let enrolled = 0;
    const results: Array<{ lead_id: string; contact_id?: string; status: string; error?: string }> = [];

    for (const lead of leadsToConvert) {
      try {
        const result = await convertSingleLead(supabase, lead, autoEnroll);
        converted++;
        if (result.enrolled) enrolled++;
        results.push({ lead_id: lead.id as string, contact_id: result.contactId, status: 'converted' });
      } catch (error) {
        failed++;
        const errMsg = error instanceof Error ? error.message : String(error);
        results.push({ lead_id: lead.id as string, status: 'failed', error: errMsg });
        await logger.error('lead-conversion-failed', error, { lead_id: lead.id });
      }
    }

    await logger.info('conversion-complete', { converted, failed, enrolled });

    return new Response(
      JSON.stringify({
        message: 'Lead conversion complete',
        converted,
        failed,
        enrolled,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('convert-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Convert a single mkt_lead into a CRM contact.
 */
async function convertSingleLead(
  supabase: ReturnType<typeof getSupabaseClient>,
  lead: Record<string, unknown>,
  autoEnroll: boolean
): Promise<{ contactId: string; enrolled: boolean }> {
  const orgId = lead.org_id as string;

  // Check if a contact with this email already exists in the CRM
  let existingContactId: string | null = null;

  if (lead.email) {
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', lead.email as string)
      .limit(1);

    if (existingContact && existingContact.length > 0) {
      existingContactId = existingContact[0].id;
    }
  }

  let contactId: string;

  if (existingContactId) {
    // Link to existing contact — don't create duplicate
    contactId = existingContactId;

    // Update existing contact with any missing fields from the lead
    const updates: Record<string, unknown> = {};
    if (lead.phone) updates.phone = lead.phone;
    if (lead.company) updates.company = lead.company;
    if (lead.job_title) updates.job_title = lead.job_title;
    if (lead.city) updates.city = lead.city;
    if (lead.state) updates.state = lead.state;
    if (lead.country) updates.country = lead.country;
    if (lead.linkedin_url) updates.linkedin_url = lead.linkedin_url;
    if (lead.website) updates.website = lead.website;
    if (lead.industry) updates.organization_industry = lead.industry;

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('contacts')
        .update(updates)
        .eq('id', contactId)
        .is('company', null); // Only fill empty fields — don't overwrite
    }
  } else {
    // Create new CRM contact
    // First, get the default pipeline stage for new contacts
    const { data: defaultStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('org_id', orgId)
      .order('stage_order', { ascending: true })
      .limit(1);

    const { data: newContact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        org_id: orgId,
        first_name: lead.first_name || null,
        last_name: lead.last_name || null,
        email: lead.email || null,
        phone: lead.phone || null,
        company: lead.company || null,
        job_title: lead.job_title || null,
        city: lead.city || null,
        state: lead.state || null,
        country: lead.country || 'India',
        linkedin_url: lead.linkedin_url || null,
        website: lead.website || null,
        source: `mkt-engine-${lead.source || 'apollo'}`,
        status: 'lead',
        pipeline_stage_id: defaultStage?.[0]?.id || null,
        notes: `Auto-converted from Revenue Engine. Score: ${lead.total_score}/100. Campaign: ${lead.campaign_id || 'N/A'}`,
      })
      .select('id')
      .single();

    if (contactError || !newContact) {
      throw new Error(`Failed to create contact: ${contactError?.message}`);
    }

    contactId = newContact.id;
  }

  // Update the mkt_lead record
  await supabase
    .from('mkt_leads')
    .update({
      contact_id: contactId,
      status: 'converted',
      converted_at: new Date().toISOString(),
    })
    .eq('id', lead.id as string);

  // Auto-enroll in campaign sequence if configured
  let didEnroll = false;
  if (autoEnroll && lead.campaign_id) {
    didEnroll = await enrollInSequence(supabase, lead, contactId);
  }

  // Log activity on the new contact
  await supabase.from('contact_activities').insert({
    org_id: orgId,
    contact_id: contactId,
    activity_type: 'note',
    subject: 'Lead Converted (Revenue Engine)',
    description: `Automatically converted from marketing lead. Source: ${lead.source}. Score: ${lead.total_score}/100. Fit: ${lead.fit_score}, Intent: ${lead.intent_score}, Engagement: ${lead.engagement_score}.`,
  });

  return { contactId, enrolled: didEnroll };
}

/**
 * Auto-enroll a converted lead in its campaign sequence.
 * Creates a mkt_sequence_enrollment and schedules the first action.
 */
async function enrollInSequence(
  supabase: ReturnType<typeof getSupabaseClient>,
  lead: Record<string, unknown>,
  contactId: string
): Promise<boolean> {
  const campaignId = lead.campaign_id as string;
  const orgId = lead.org_id as string;

  // Check if campaign has active steps
  const { data: steps } = await supabase
    .from('mkt_campaign_steps')
    .select('id, step_number, channel, delay_hours')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .order('step_number', { ascending: true });

  if (!steps || steps.length === 0) return false;

  // Check if already enrolled
  const { data: existingEnrollment } = await supabase
    .from('mkt_sequence_enrollments')
    .select('id')
    .eq('lead_id', lead.id as string)
    .eq('campaign_id', campaignId)
    .in('status', ['active', 'paused'])
    .limit(1);

  if (existingEnrollment && existingEnrollment.length > 0) return false;

  // Calculate when the first action should fire
  const firstStep = steps[0];
  const nextActionAt = new Date(Date.now() + (firstStep.delay_hours || 0) * 60 * 60 * 1000);

  const { error: enrollError } = await supabase
    .from('mkt_sequence_enrollments')
    .insert({
      org_id: orgId,
      lead_id: lead.id as string,
      campaign_id: campaignId,
      current_step: 1,
      status: 'active',
      next_action_at: nextActionAt.toISOString(),
    });

  if (enrollError) {
    console.error('[mkt-convert-lead] Enrollment failed:', enrollError);
    return false;
  }

  // Update the lead record
  await supabase
    .from('mkt_leads')
    .update({ enrolled_at: new Date().toISOString() })
    .eq('id', lead.id as string);

  return true;
}
