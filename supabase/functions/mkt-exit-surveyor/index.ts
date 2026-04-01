import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_LEADS_PER_RUN = 50;
const INACTIVE_DAYS = 30;

const EXIT_SURVEY_MESSAGE =
  `We noticed you didn't continue with us. Mind sharing why? Reply with: 1=Pricing, 2=No need, 3=Chose competitor, 4=Bad experience, 5=Other`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-exit-surveyor');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - INACTIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await logger.info('surveyor-start', { cutoff_date: cutoffDate });

    // 1. Query disqualified leads
    const { data: disqualifiedLeads, error: disqError } = await supabase
      .from('mkt_leads')
      .select('id, org_id, phone, first_name, contact_id')
      .eq('status', 'disqualified');

    if (disqError) throw new Error(`Failed to fetch disqualified leads: ${disqError.message}`);

    // 2. Query inactive leads (not converted, not updated in 30+ days)
    const { data: inactiveLeads, error: inactiveError } = await supabase
      .from('mkt_leads')
      .select('id, org_id, phone, first_name, contact_id')
      .not('status', 'in', '("converted","disqualified")')
      .lt('updated_at', cutoffDate);

    if (inactiveError) throw new Error(`Failed to fetch inactive leads: ${inactiveError.message}`);

    // Combine and deduplicate by lead id
    const allLeads = [...(disqualifiedLeads || []), ...(inactiveLeads || [])];
    const leadMap = new Map<string, typeof allLeads[0]>();
    for (const lead of allLeads) {
      leadMap.set(lead.id, lead);
    }
    const uniqueLeads = Array.from(leadMap.values());

    if (uniqueLeads.length === 0) {
      await logger.info('surveyor-no-leads', { message: 'No dead leads found' });
      return new Response(
        JSON.stringify({ message: 'No dead leads found', surveyed: 0, skipped: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Filter out leads that already have an exit survey
    const leadIds = uniqueLeads.map((l) => l.id);
    const { data: existingSurveys, error: surveyError } = await supabase
      .from('mkt_exit_surveys')
      .select('lead_id')
      .in('lead_id', leadIds);

    if (surveyError) throw new Error(`Failed to check existing surveys: ${surveyError.message}`);

    const surveyedLeadIds = new Set((existingSurveys || []).map((s) => s.lead_id));
    const eligibleLeads = uniqueLeads
      .filter((l) => !surveyedLeadIds.has(l.id))
      .filter((l) => l.phone) // Must have a phone number for WhatsApp
      .slice(0, MAX_LEADS_PER_RUN);

    if (eligibleLeads.length === 0) {
      await logger.info('surveyor-all-surveyed', {
        total_dead_leads: uniqueLeads.length,
        already_surveyed: surveyedLeadIds.size,
      });
      return new Response(
        JSON.stringify({
          message: 'All dead leads already surveyed or have no phone',
          total_dead: uniqueLeads.length,
          already_surveyed: surveyedLeadIds.size,
          surveyed: 0,
          skipped: 0,
          failed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logger.info('surveyor-eligible', {
      total_dead: uniqueLeads.length,
      already_surveyed: surveyedLeadIds.size,
      eligible: eligibleLeads.length,
    });

    // 4. Send exit surveys
    let surveyed = 0;
    let failed = 0;
    let skipped = 0;

    for (const lead of eligibleLeads) {
      try {
        // Personalize message
        const name = lead.first_name || 'there';
        const message = `Hi ${name}, ${EXIT_SURVEY_MESSAGE}`;

        // Send WhatsApp message via mkt-send-whatsapp
        // We create a lightweight action record for tracking, then invoke the sender
        // using the direct fetch pattern (same as mkt-sequence-executor)
        const response = await fetch(`${supabaseUrl}/functions/v1/mkt-send-whatsapp`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action_id: `exit-survey-${lead.id}`,
            enrollment_id: `exit-survey-${lead.id}`,
            lead_id: lead.id,
            step_id: `exit-survey`,
            channel: 'whatsapp',
          }),
        });

        const sendResult = await response.json();

        if (!response.ok || !sendResult.success) {
          // Create survey row marked as failed
          await supabase.from('mkt_exit_surveys').insert({
            org_id: lead.org_id,
            lead_id: lead.id,
            contact_id: lead.contact_id || null,
            channel: 'whatsapp',
            sent_at: null,
            response_text: null,
            exit_reason: null,
            signals_extracted: { error: sendResult.error || 'Send failed' },
          });

          await logger.warn('survey-send-failed', {
            lead_id: lead.id,
            error: sendResult.error || 'Unknown send error',
          });
          failed++;
          continue;
        }

        // Create survey row with sent_at
        const { error: insertError } = await supabase.from('mkt_exit_surveys').insert({
          org_id: lead.org_id,
          lead_id: lead.id,
          contact_id: lead.contact_id || null,
          channel: 'whatsapp',
          sent_at: now.toISOString(),
          response_text: null,
          exit_reason: null,
          would_return: null,
          nps_score: null,
          signals_extracted: null,
        });

        if (insertError) {
          await logger.error('survey-insert-failed', insertError, { lead_id: lead.id });
          failed++;
          continue;
        }

        surveyed++;
      } catch (error) {
        await logger.error('survey-lead-failed', error, { lead_id: lead.id });
        failed++;
      }
    }

    await logger.info('surveyor-complete', {
      total_dead: uniqueLeads.length,
      eligible: eligibleLeads.length,
      surveyed,
      skipped,
      failed,
    });

    return new Response(
      JSON.stringify({
        message: 'Exit survey run complete',
        total_dead: uniqueLeads.length,
        eligible: eligibleLeads.length,
        surveyed,
        skipped,
        failed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('surveyor-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
