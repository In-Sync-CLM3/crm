import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { callLLM } from '../_shared/llmClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Wednesday Report — Product Intelligence Reporter
 * Runs Wed 2:30AM UTC via pg_cron.
 *
 * Synthesizes weekly feature signals, drop-off data, and NPS trends
 * into structured questions for the founder. Emails the report.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-product-intelligence-reporter');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get all orgs with feature signals
    const { data: orgSignals } = await supabase
      .from('mkt_feature_signals')
      .select('org_id')
      .eq('surfaced_in_report', false);

    const orgIds = [...new Set((orgSignals || []).map((s) => s.org_id))];

    if (orgIds.length === 0) {
      // Also check for orgs with recent NPS or drop-off data
      const { data: npsOrgs } = await supabase
        .from('mkt_nps_responses')
        .select('org_id')
        .gte('responded_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const allOrgIds = [...new Set([...orgIds, ...(npsOrgs || []).map((n) => n.org_id)])];
      if (allOrgIds.length === 0) {
        return new Response(
          JSON.stringify({ message: 'No data for weekly report' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      orgIds.push(...allOrgIds);
    }

    let reportsSent = 0;

    for (const orgId of [...new Set(orgIds)]) {
      try {
        await generateWeeklyReport(supabase, supabaseUrl, serviceRoleKey, orgId, logger);
        reportsSent++;
      } catch (err) {
        await logger.error('report-failed-for-org', err, { org_id: orgId });
      }
    }

    await logger.info('reports-complete', { reports_sent: reportsSent });

    return new Response(
      JSON.stringify({ message: 'Weekly reports complete', reports_sent: reportsSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('reporter-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function generateWeeklyReport(
  supabase: ReturnType<typeof getSupabaseClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  logger: ReturnType<typeof createEngineLogger>
): Promise<void> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const reportDate = new Date().toISOString().split('T')[0];

  // 1. Gather unsurfaced feature signals
  const { data: signals } = await supabase
    .from('mkt_feature_signals')
    .select('*')
    .eq('org_id', orgId)
    .eq('surfaced_in_report', false)
    .order('frequency_count', { ascending: false })
    .limit(20);

  // 2. Gather latest drop-off snapshot
  const { data: dropoff } = await supabase
    .from('mkt_dropoff_snapshots')
    .select('*')
    .eq('org_id', orgId)
    .order('snapshot_date', { ascending: false })
    .limit(3);

  // 3. Gather recent NPS responses
  const { data: npsResponses } = await supabase
    .from('mkt_nps_responses')
    .select('*')
    .eq('org_id', orgId)
    .gte('responded_at', oneWeekAgo)
    .order('responded_at', { ascending: false });

  // 4. Get previous decisions for context
  const { data: recentDecisions } = await supabase
    .from('mkt_product_decisions')
    .select('product_key, your_response, decision_type')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Build the report using Sonnet
  const prompt = buildReportPrompt(signals || [], dropoff || [], npsResponses || [], recentDecisions || []);

  const reportResponse = await callLLM(prompt, {
    model: 'sonnet',
    max_tokens: 2048,
    temperature: 0.3,
    system: `You are the Product Intelligence Engine for an autonomous CRM revenue system. You generate weekly reports for the founder, synthesizing customer signals into actionable questions. Be direct, data-driven, and concise. Every question must have clear context and options.`,
  });

  const reportContent = reportResponse.content;

  // Store the report as product decisions (questions awaiting response)
  const questions = extractQuestions(reportContent);

  for (const question of questions) {
    await supabase.from('mkt_product_decisions').insert({
      org_id: orgId,
      report_date: reportDate,
      product_key: question.productKey,
      engine_question: question.text,
      decision_type: null, // Awaiting founder response
      feature_signal_ids: question.signalIds || [],
    });
  }

  // Mark signals as surfaced
  if (signals && signals.length > 0) {
    await supabase
      .from('mkt_feature_signals')
      .update({ surfaced_in_report: true })
      .in('id', signals.map((s) => s.id));
  }

  // Email the report to org admins
  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .eq('org_id', orgId)
    .in('id', (
      await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'super_admin'])
    ).data?.map((r) => r.user_id) || []);

  const emailHtml = buildReportEmail(reportContent, reportDate, signals || [], npsResponses || []);

  for (const admin of admins || []) {
    if (!admin.email) continue;

    try {
      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: admin.email,
          subject: `[Wednesday Report] Product Intelligence — ${reportDate}`,
          html: emailHtml,
          reply_to: `product-decisions+${orgId}@yourdomain.com`, // For reply-based decision capture
        }),
      });
    } catch (err) {
      console.error('[mkt-product-intelligence-reporter] Email failed:', err);
    }
  }

  await logger.info('report-generated', {
    org_id: orgId,
    signals_count: signals?.length || 0,
    questions_count: questions.length,
    nps_responses: npsResponses?.length || 0,
  }, { tokens_used: reportResponse.input_tokens + reportResponse.output_tokens });
}

function buildReportPrompt(
  signals: Array<Record<string, unknown>>,
  dropoff: Array<Record<string, unknown>>,
  nps: Array<Record<string, unknown>>,
  previousDecisions: Array<Record<string, unknown>>
): string {
  let prompt = `Generate the Wednesday Product Intelligence Report.

## FEATURE SIGNALS THIS WEEK (${signals.length} signals)
`;

  if (signals.length > 0) {
    // Group by product_key
    const grouped: Record<string, Array<Record<string, unknown>>> = {};
    for (const s of signals) {
      const key = s.product_key as string;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    }

    for (const [key, sigs] of Object.entries(grouped)) {
      const totalFreq = sigs.reduce((s, sig) => s + ((sig.frequency_count as number) || 1), 0);
      const categories = [...new Set(sigs.map((s) => s.signal_category))];
      const channels = [...new Set(sigs.map((s) => s.source_channel))];
      const monetisable = sigs.some((s) => s.is_monetisable);

      prompt += `\n### ${key} (mentioned ${totalFreq}x)
- Categories: ${categories.join(', ')}
- Channels: ${channels.join(', ')}
- Monetisable: ${monetisable ? 'Yes' : 'No'}
- Sample quotes: ${sigs.slice(0, 2).map((s) => `"${(s.signal_text as string).substring(0, 150)}"`).join('; ')}
`;
    }
  } else {
    prompt += 'No new feature signals this week.\n';
  }

  prompt += `\n## DROP-OFF DATA\n`;
  if (dropoff.length > 0) {
    for (const d of dropoff) {
      prompt += `${d.product_key} (${d.snapshot_date}): Landing→Trial ${d.landing_to_trial_pct}%, Trial→Aha ${d.trial_to_aha_pct}%, Aha→Payment ${d.aha_to_payment_pct}%, 30d Retention ${d.retention_30_pct}%\n`;
    }
  } else {
    prompt += 'No drop-off data available.\n';
  }

  prompt += `\n## NPS RESPONSES (${nps.length} this week)\n`;
  if (nps.length > 0) {
    const scores = nps.map((n) => n.score as number);
    const avgNPS = scores.reduce((s, n) => s + n, 0) / scores.length;
    const promoters = scores.filter((s) => s >= 9).length;
    const detractors = scores.filter((s) => s <= 6).length;

    prompt += `Average: ${avgNPS.toFixed(1)}, Promoters: ${promoters}, Detractors: ${detractors}\n`;
    const detractorResponses = nps.filter((n) => (n.score as number) <= 6 && n.response_text);
    if (detractorResponses.length > 0) {
      prompt += `Detractor feedback:\n`;
      for (const d of detractorResponses.slice(0, 3)) {
        prompt += `- Score ${d.score}: "${(d.response_text as string).substring(0, 150)}"\n`;
      }
    }
  } else {
    prompt += 'No NPS responses this week.\n';
  }

  if (previousDecisions.length > 0) {
    prompt += `\n## YOUR PREVIOUS DECISIONS (for context)\n`;
    for (const d of previousDecisions.slice(0, 5)) {
      prompt += `- ${d.product_key}: ${d.decision_type} — "${(d.your_response as string)?.substring(0, 100) || 'No response yet'}"\n`;
    }
  }

  prompt += `\n## YOUR TASK
Generate 3-7 questions for the founder, each tied to specific data above. Format each question as:

**Q[N]: [Question title]**
Product key: [product_key]
Context: [Brief data-backed context]
Options: [investigate / build / wont-build / defer / needs-more-data]
Signal IDs: [comma-separated UUIDs if applicable]

Focus on the highest-impact signals. Prioritize by frequency and monetisability.`;

  return prompt;
}

interface ExtractedQuestion {
  productKey: string;
  text: string;
  signalIds: string[];
}

function extractQuestions(reportContent: string): ExtractedQuestion[] {
  const questions: ExtractedQuestion[] = [];

  // Parse questions from the Sonnet output
  const questionBlocks = reportContent.split(/\*\*Q\d+:/);

  for (const block of questionBlocks.slice(1)) { // Skip first split (before Q1)
    const lines = block.trim().split('\n');
    const title = lines[0]?.replace(/\*\*/g, '').trim() || '';

    let productKey = 'unknown';
    let signalIds: string[] = [];

    for (const line of lines) {
      if (line.toLowerCase().startsWith('product key:')) {
        productKey = line.split(':').slice(1).join(':').trim();
      }
      if (line.toLowerCase().startsWith('signal ids:')) {
        const ids = line.split(':').slice(1).join(':').trim();
        signalIds = ids.split(',').map((id) => id.trim()).filter((id) => id.length > 10);
      }
    }

    if (title) {
      questions.push({
        productKey,
        text: block.trim(),
        signalIds,
      });
    }
  }

  return questions;
}

function buildReportEmail(
  reportContent: string,
  reportDate: string,
  signals: Array<Record<string, unknown>>,
  nps: Array<Record<string, unknown>>
): string {
  // Convert markdown-ish content to HTML
  const htmlContent = reportContent
    .replace(/\*\*Q(\d+): (.*?)\*\*/g, '<h3 style="color: #3b82f6; margin-top: 24px;">Q$1: $2</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/gs, '<ul style="margin: 8px 0; padding-left: 20px;">$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html>
<head><style>
  body { font-family: -apple-system, sans-serif; background: #f9fafb; padding: 20px; }
  .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; padding: 24px; }
  .header h1 { margin: 0 0 4px; font-size: 22px; }
  .header p { margin: 0; opacity: 0.8; }
  .stats { display: flex; gap: 16px; padding: 16px 24px; background: #f9fafb; }
  .stat { flex: 1; text-align: center; }
  .stat .value { font-size: 20px; font-weight: 700; }
  .stat .label { font-size: 11px; color: #6b7280; }
  .content { padding: 24px; color: #374151; line-height: 1.7; font-size: 14px; }
  .reply-cta { margin: 24px; padding: 16px; background: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6; }
  .reply-cta p { margin: 0; font-size: 13px; color: #1e40af; }
  .footer { padding: 16px 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>Wednesday Product Intelligence Report</h1>
    <p>${reportDate}</p>
  </div>
  <div class="stats">
    <div class="stat"><div class="value">${signals.length}</div><div class="label">Feature Signals</div></div>
    <div class="stat"><div class="value">${nps.length}</div><div class="label">NPS Responses</div></div>
    <div class="stat"><div class="value">${signals.filter((s) => s.is_monetisable).length}</div><div class="label">Monetisable</div></div>
  </div>
  <div class="content">
    <p>${htmlContent}</p>
  </div>
  <div class="reply-cta">
    <p><strong>Reply to this email with your decisions.</strong> For each question, reply with the question number and your decision (investigate/build/wont-build/defer). Example: "Q1: build — let's add this to the sprint."</p>
  </div>
  <div class="footer">Generated by In-Sync CRM Product Intelligence Engine</div>
</div>
</body>
</html>`;
}
