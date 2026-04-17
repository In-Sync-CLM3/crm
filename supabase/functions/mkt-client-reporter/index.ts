import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLM } from '../_shared/llmClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 100;

interface ContactMetrics {
  contact_id: string;
  contact_email: string;
  contact_name: string;
  company: string;
  leads_sourced: number;
  leads_qualified: number;
  meetings_booked: number;
  deals_won: number;
  revenue_generated: number; // paise
  emails_sent: number;
  emails_opened: number;
  whatsapp_sent: number;
  whatsapp_replied: number;
  calls_made: number;
  calls_engaged: number;
  roi_pct: number | null;
  cost_total: number; // paise
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-client-reporter');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Calculate previous month boundaries
    const now = new Date();
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
    const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);
    const reportMonth = `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, '0')}-01`;
    const periodStartISO = prevMonthStart.toISOString();
    const periodEndISO = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), prevMonthEnd.getDate(), 23, 59, 59, 999).toISOString();

    await logger.info('run-started', {
      report_month: reportMonth,
      period_start: periodStartISO,
      period_end: periodEndISO,
    });

    // Get all orgs that have mkt_campaigns
    const { data: orgs } = await supabase
      .from('mkt_campaigns')
      .select('org_id');

    const orgIds = [...new Set((orgs || []).map((o) => o.org_id))];

    if (orgIds.length === 0) {
      await logger.info('no-orgs', { message: 'No orgs with mkt_campaigns found' });
      return new Response(
        JSON.stringify({ success: true, orgs_processed: 0, reports_generated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalReports = 0;

    for (const orgId of orgIds) {
      try {
        const count = await processOrg(
          supabase, supabaseUrl, serviceRoleKey,
          orgId, reportMonth, periodStartISO, periodEndISO, logger
        );
        totalReports += count;
      } catch (err) {
        await logger.error('org-failed', err, { org_id: orgId });
      }
    }

    await logger.info('run-complete', {
      orgs_processed: orgIds.length,
      reports_generated: totalReports,
    });

    return new Response(
      JSON.stringify({
        success: true,
        orgs_processed: orgIds.length,
        reports_generated: totalReports,
        report_month: reportMonth,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ---------------------------------------------------------------------------
// Process a single org: find paying contacts, aggregate, report, email
// ---------------------------------------------------------------------------
async function processOrg(
  supabase: ReturnType<typeof getSupabaseClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  reportMonth: string,
  periodStartISO: string,
  periodEndISO: string,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<number> {
  // Find contacts who have invoices in the previous month (paying contacts)
  const { data: invoiceRows } = await supabase
    .from('client_invoices')
    .select('contact_id, amount, status')
    .eq('org_id', orgId)
    .not('contact_id', 'is', null)
    .gte('created_at', periodStartISO)
    .lte('created_at', periodEndISO);

  if (!invoiceRows || invoiceRows.length === 0) {
    await logger.info('no-paying-contacts', { org_id: orgId });
    return 0;
  }

  // Aggregate revenue per contact from invoices
  const contactRevenueMap: Record<string, number> = {};
  for (const inv of invoiceRows) {
    if (!inv.contact_id) continue;
    const amountPaise = Math.round((Number(inv.amount) || 0) * 100);
    contactRevenueMap[inv.contact_id] = (contactRevenueMap[inv.contact_id] || 0) + amountPaise;
  }

  const contactIds = Object.keys(contactRevenueMap).slice(0, BATCH_SIZE);

  if (contactIds.length === 0) return 0;

  // Fetch contact details
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, company')
    .in('id', contactIds);

  if (!contacts || contacts.length === 0) return 0;

  // Fetch all mkt_leads for these contacts in this org created during the period
  const { data: allLeads } = await supabase
    .from('mkt_leads')
    .select('id, contact_id, total_score, status, converted_at, campaign_id')
    .eq('org_id', orgId)
    .in('contact_id', contactIds)
    .gte('created_at', periodStartISO)
    .lte('created_at', periodEndISO);

  const leads = allLeads || [];

  // Build lead IDs list and a per-contact leads map
  const contactLeadsMap: Record<string, typeof leads> = {};
  const allLeadIds: string[] = [];
  for (const lead of leads) {
    if (!lead.contact_id) continue;
    if (!contactLeadsMap[lead.contact_id]) contactLeadsMap[lead.contact_id] = [];
    contactLeadsMap[lead.contact_id].push(lead);
    allLeadIds.push(lead.id);
  }

  // Also fetch leads that converted this month (may have been created earlier)
  const { data: convertedLeads } = await supabase
    .from('mkt_leads')
    .select('id, contact_id, total_score, status, converted_at, campaign_id')
    .eq('org_id', orgId)
    .eq('status', 'converted')
    .in('contact_id', contactIds)
    .gte('converted_at', periodStartISO)
    .lte('converted_at', periodEndISO);

  const convertedLeadsByContact: Record<string, number> = {};
  for (const lead of (convertedLeads || [])) {
    if (!lead.contact_id) continue;
    convertedLeadsByContact[lead.contact_id] = (convertedLeadsByContact[lead.contact_id] || 0) + 1;
  }

  // Fetch sequence actions for these leads via enrollments
  // First get enrollment IDs for the leads
  const allLeadIdsUnique = [...new Set([...allLeadIds, ...(convertedLeads || []).map((l) => l.id)])];

  let actionsMap: Record<string, Array<{ channel: string; status: string; metadata: Record<string, unknown>; opened_at: string | null; replied_at: string | null }>> = {};

  if (allLeadIdsUnique.length > 0) {
    const { data: enrollments } = await supabase
      .from('mkt_sequence_enrollments')
      .select('id, lead_id')
      .eq('org_id', orgId)
      .in('lead_id', allLeadIdsUnique);

    if (enrollments && enrollments.length > 0) {
      const enrollmentIds = enrollments.map((e) => e.id);
      const enrollmentToLead: Record<string, string> = {};
      for (const e of enrollments) {
        enrollmentToLead[e.id] = e.lead_id;
      }

      const { data: actions } = await supabase
        .from('mkt_sequence_actions')
        .select('enrollment_id, channel, status, metadata, opened_at, replied_at')
        .eq('org_id', orgId)
        .in('enrollment_id', enrollmentIds)
        .gte('created_at', periodStartISO)
        .lte('created_at', periodEndISO);

      // Map actions to lead_id, then to contact_id
      const leadActionsMap: Record<string, typeof actions> = {};
      for (const action of (actions || [])) {
        const leadId = enrollmentToLead[action.enrollment_id];
        if (!leadId) continue;
        if (!leadActionsMap[leadId]) leadActionsMap[leadId] = [];
        leadActionsMap[leadId].push(action);
      }

      // Map lead actions to contact actions
      for (const lead of [...leads, ...(convertedLeads || [])]) {
        if (!lead.contact_id) continue;
        const leadActions = leadActionsMap[lead.id];
        if (!leadActions) continue;
        if (!actionsMap[lead.contact_id]) actionsMap[lead.contact_id] = [];
        actionsMap[lead.contact_id].push(...leadActions);
      }
    }
  }

  // Fetch cost + score threshold config for the org
  const [costConfig, thresholdsConfig] = await Promise.all([
    supabase.from('mkt_engine_config').select('config_value').eq('org_id', orgId).eq('config_key', 'cost_per_contact_monthly').maybeSingle(),
    supabase.from('mkt_engine_config').select('config_value').eq('org_id', orgId).eq('config_key', 'score_thresholds').maybeSingle(),
  ]);

  // Default cost per contact per month: Rs 500 = 50000 paise
  const costPerContact = costConfig.data?.config_value
    ? Number((costConfig.data.config_value as Record<string, unknown>).value || 50000)
    : 50000;

  // Conversion threshold — single source of truth in mkt_engine_config
  const conversionMin: number =
    (thresholdsConfig.data?.config_value as Record<string, number> | null)?.conversion_min ?? 70;

  // Process each contact
  let reportsGenerated = 0;

  for (const contact of contacts) {
    try {
      const metrics = aggregateContactMetrics(
        contact,
        contactRevenueMap[contact.id] || 0,
        contactLeadsMap[contact.id] || [],
        convertedLeadsByContact[contact.id] || 0,
        actionsMap[contact.id] || [],
        costPerContact,
        conversionMin,
      );

      // Generate narrative via LLM
      const narrative = await generateNarrative(metrics, reportMonth, conversionMin);

      // Insert into mkt_client_outcomes
      const { error: insertError } = await supabase.from('mkt_client_outcomes').insert({
        org_id: orgId,
        contact_id: contact.id,
        report_month: reportMonth,
        leads_sourced: metrics.leads_sourced,
        leads_qualified: metrics.leads_qualified,
        meetings_booked: metrics.meetings_booked,
        deals_won: metrics.deals_won,
        revenue_generated: metrics.revenue_generated,
        emails_sent: metrics.emails_sent,
        emails_opened: metrics.emails_opened,
        whatsapp_sent: metrics.whatsapp_sent,
        whatsapp_replied: metrics.whatsapp_replied,
        calls_made: metrics.calls_made,
        calls_engaged: metrics.calls_engaged,
        roi_pct: metrics.roi_pct,
        narrative,
      });

      if (insertError) {
        await logger.error('insert-outcome-failed', insertError, {
          org_id: orgId,
          contact_id: contact.id,
        });
        continue;
      }

      // Send email report
      if (contact.email) {
        const emailHtml = buildReportEmail(metrics, narrative, reportMonth);
        const monthLabel = formatMonthLabel(reportMonth);

        try {
          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: contact.email,
              subject: `Your Monthly Performance Report - ${monthLabel}`,
              html: emailHtml,
            }),
          });

          // Mark as emailed
          await supabase
            .from('mkt_client_outcomes')
            .update({ emailed_at: new Date().toISOString() })
            .eq('org_id', orgId)
            .eq('contact_id', contact.id)
            .eq('report_month', reportMonth);
        } catch (emailErr) {
          await logger.error('email-send-failed', emailErr, {
            org_id: orgId,
            contact_id: contact.id,
            email: contact.email,
          });
        }
      }

      reportsGenerated++;
    } catch (contactErr) {
      await logger.error('contact-processing-failed', contactErr, {
        org_id: orgId,
        contact_id: contact.id,
      });
      // Continue to next contact
    }
  }

  await logger.info('org-complete', {
    org_id: orgId,
    contacts_processed: contacts.length,
    reports_generated: reportsGenerated,
  });

  return reportsGenerated;
}

// ---------------------------------------------------------------------------
// Aggregate metrics for a single contact
// ---------------------------------------------------------------------------
function aggregateContactMetrics(
  contact: { id: string; email: string | null; first_name: string; last_name: string | null; company: string | null },
  revenueGenerated: number,
  leads: Array<{ id: string; total_score: number; status: string; converted_at: string | null; campaign_id: string | null }>,
  dealsWon: number,
  actions: Array<{ channel: string; status: string; metadata: Record<string, unknown>; opened_at: string | null; replied_at: string | null }>,
  costPerContact: number,
  conversionMin: number,
): ContactMetrics {
  const leadsSourced = leads.length;
  const leadsQualified = leads.filter((l) => (l.total_score || 0) >= conversionMin).length;

  // Meetings booked: actions where metadata contains 'meeting' or 'demo'
  const meetingsBooked = actions.filter((a) => {
    const meta = a.metadata || {};
    const metaStr = JSON.stringify(meta).toLowerCase();
    return metaStr.includes('meeting') || metaStr.includes('demo');
  }).length;

  // Email metrics
  const emailActions = actions.filter((a) => a.channel === 'email');
  const emailsSent = emailActions.length;
  const emailsOpened = emailActions.filter((a) => a.opened_at).length;

  // WhatsApp metrics
  const whatsappActions = actions.filter((a) => a.channel === 'whatsapp');
  const whatsappSent = whatsappActions.length;
  const whatsappReplied = whatsappActions.filter((a) => a.replied_at).length;

  // Call metrics
  const callActions = actions.filter((a) => a.channel === 'call');
  const callsMade = callActions.length;
  const callsEngaged = callActions.filter((a) => a.replied_at || a.opened_at).length;

  // ROI calculation: (revenue - cost) / cost * 100
  const roiPct = costPerContact > 0
    ? Math.round(((revenueGenerated - costPerContact) / costPerContact) * 100 * 100) / 100
    : null;

  const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown';

  return {
    contact_id: contact.id,
    contact_email: contact.email || '',
    contact_name: contactName,
    company: contact.company || '',
    leads_sourced: leadsSourced,
    leads_qualified: leadsQualified,
    meetings_booked: meetingsBooked,
    deals_won: dealsWon,
    revenue_generated: revenueGenerated,
    emails_sent: emailsSent,
    emails_opened: emailsOpened,
    whatsapp_sent: whatsappSent,
    whatsapp_replied: whatsappReplied,
    calls_made: callsMade,
    calls_engaged: callsEngaged,
    roi_pct: roiPct,
    cost_total: costPerContact,
  };
}

// ---------------------------------------------------------------------------
// Generate narrative summary using Claude Sonnet
// ---------------------------------------------------------------------------
async function generateNarrative(
  metrics: ContactMetrics,
  reportMonth: string,
  conversionMin: number,
): Promise<string> {
  const monthLabel = formatMonthLabel(reportMonth);
  const revRupees = (metrics.revenue_generated / 100).toLocaleString('en-IN');

  const prompt = `Write a brief (2-3 paragraph) monthly performance summary for a client. Be professional, data-driven, and positive. Highlight wins and suggest areas for improvement.

CLIENT: ${metrics.contact_name}${metrics.company ? ` (${metrics.company})` : ''}
PERIOD: ${monthLabel}

PERFORMANCE METRICS:
- Leads sourced: ${metrics.leads_sourced}
- Leads qualified (score >= ${conversionMin}): ${metrics.leads_qualified}
- Meetings booked: ${metrics.meetings_booked}
- Deals won: ${metrics.deals_won}
- Revenue generated: Rs ${revRupees}
- Emails sent: ${metrics.emails_sent}, opened: ${metrics.emails_opened}
- WhatsApp sent: ${metrics.whatsapp_sent}, replied: ${metrics.whatsapp_replied}
- Calls made: ${metrics.calls_made}, engaged: ${metrics.calls_engaged}
- ROI: ${metrics.roi_pct !== null ? `${metrics.roi_pct}%` : 'N/A'}

Write a concise, professional narrative addressed to the client. Use actual numbers. Focus on outcomes and value delivered. End with a brief forward-looking note.`;

  try {
    const response = await callLLM(prompt, {
      model: 'sonnet',
      max_tokens: 512,
      temperature: 0.4,
    });
    return response.content;
  } catch {
    // Fallback if LLM fails
    return `In ${monthLabel}, we sourced ${metrics.leads_sourced} leads for you, of which ${metrics.leads_qualified} qualified. ${metrics.deals_won} deals were won, generating Rs ${revRupees} in revenue. ${metrics.roi_pct !== null ? `Your ROI for the month was ${metrics.roi_pct}%.` : ''} We look forward to building on these results next month.`;
  }
}

// ---------------------------------------------------------------------------
// Build HTML email report
// ---------------------------------------------------------------------------
function buildReportEmail(
  metrics: ContactMetrics,
  narrative: string,
  reportMonth: string,
): string {
  const monthLabel = formatMonthLabel(reportMonth);
  const revRupees = (metrics.revenue_generated / 100).toLocaleString('en-IN');
  const emailOpenRate = metrics.emails_sent > 0
    ? Math.round((metrics.emails_opened / metrics.emails_sent) * 100)
    : 0;
  const waReplyRate = metrics.whatsapp_sent > 0
    ? Math.round((metrics.whatsapp_replied / metrics.whatsapp_sent) * 100)
    : 0;

  return `<!DOCTYPE html>
<html>
<head><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; padding: 20px; margin: 0; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 28px 24px; }
  .header h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
  .header p { margin: 0; opacity: 0.85; font-size: 14px; }
  .hero { padding: 24px; text-align: center; border-bottom: 1px solid #f3f4f6; }
  .hero .revenue { font-size: 36px; font-weight: 800; color: #059669; margin: 0; }
  .hero .revenue-label { font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #f3f4f6; margin: 0; }
  .metric { text-align: center; padding: 16px 8px; background: white; }
  .metric .value { font-size: 22px; font-weight: 700; color: #111827; }
  .metric .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 4px; }
  .section { padding: 20px 24px; }
  .section h3 { font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .channel-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
  .channel-row:last-child { border-bottom: none; }
  .channel-name { color: #374151; font-weight: 500; }
  .channel-stats { color: #6b7280; }
  .channel-rate { font-weight: 600; color: #059669; }
  .narrative { padding: 4px 24px 20px; color: #374151; line-height: 1.7; font-size: 14px; }
  .narrative p { margin: 0 0 12px; }
  .roi-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 14px; font-weight: 700; margin-top: 8px; }
  .roi-positive { background: #ecfdf5; color: #059669; }
  .roi-negative { background: #fef2f2; color: #ef4444; }
  .roi-neutral { background: #f3f4f6; color: #6b7280; }
  .footer { padding: 16px 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>Monthly Performance Report</h1>
    <p>${monthLabel}${metrics.company ? ` | ${metrics.company}` : ''}</p>
  </div>

  <div class="hero">
    <div class="revenue">Rs ${revRupees}</div>
    <div class="revenue-label">Revenue Generated</div>
    ${metrics.roi_pct !== null ? `<div class="roi-badge ${metrics.roi_pct >= 0 ? 'roi-positive' : 'roi-negative'}">${metrics.roi_pct >= 0 ? '+' : ''}${metrics.roi_pct}% ROI</div>` : '<div class="roi-badge roi-neutral">ROI: N/A</div>'}
  </div>

  <div class="metrics">
    <div class="metric"><div class="value">${metrics.leads_sourced}</div><div class="label">Leads Sourced</div></div>
    <div class="metric"><div class="value">${metrics.leads_qualified}</div><div class="label">Qualified</div></div>
    <div class="metric"><div class="value">${metrics.meetings_booked}</div><div class="label">Meetings</div></div>
    <div class="metric"><div class="value">${metrics.deals_won}</div><div class="label">Deals Won</div></div>
    <div class="metric"><div class="value">${metrics.emails_sent}</div><div class="label">Emails Sent</div></div>
    <div class="metric"><div class="value">${metrics.calls_made}</div><div class="label">Calls Made</div></div>
  </div>

  <div class="section">
    <h3>Channel Performance</h3>
    <div class="channel-row">
      <span class="channel-name">Email</span>
      <span class="channel-stats">${metrics.emails_sent} sent, ${metrics.emails_opened} opened</span>
      <span class="channel-rate">${emailOpenRate}% open</span>
    </div>
    <div class="channel-row">
      <span class="channel-name">WhatsApp</span>
      <span class="channel-stats">${metrics.whatsapp_sent} sent, ${metrics.whatsapp_replied} replied</span>
      <span class="channel-rate">${waReplyRate}% reply</span>
    </div>
    <div class="channel-row">
      <span class="channel-name">Calls</span>
      <span class="channel-stats">${metrics.calls_made} made, ${metrics.calls_engaged} engaged</span>
      <span class="channel-rate">${metrics.calls_made > 0 ? Math.round((metrics.calls_engaged / metrics.calls_made) * 100) : 0}% engaged</span>
    </div>
  </div>

  <div class="narrative">
    <h3 style="font-size: 14px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px;">Summary</h3>
    ${narrative.split('\n').filter((p) => p.trim()).map((p) => `<p>${p}</p>`).join('')}
  </div>

  <div class="footer">Sent by In-Sync CRM Revenue Engine</div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Utility: format "2026-03-01" -> "March 2026"
// ---------------------------------------------------------------------------
function formatMonthLabel(reportMonth: string): string {
  const d = new Date(reportMonth + 'T00:00:00Z');
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
