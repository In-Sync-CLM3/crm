import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger, withTiming } from '../_shared/engineLogger.ts';
import { getNextChannel } from '../_shared/channelRouter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 20;  // Enrollments per run (20 × ~2s = ~40s, well within timeout)
const PARALLEL_SIZE = 1; // Sequential dispatches — prevents Supabase edge fn rate limiting

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logger = createEngineLogger('mkt-sequence-executor');

  try {
    const supabase = getSupabaseClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // Forward the incoming Authorization header — avoids SUPABASE_SERVICE_ROLE_KEY env var issues
    const serviceRoleKey = (req.headers.get('authorization') || '').replace('Bearer ', '')
      || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const now = new Date();

    // Sending window: 03:30–13:30 UTC (09:00–19:00 IST)
    const utcHour = now.getUTCHours();
    const utcMin  = now.getUTCMinutes();
    const minuteOfDay = utcHour * 60 + utcMin;
    const windowStart = 3 * 60 + 30;   // 03:30 UTC
    const windowEnd   = 13 * 60 + 30;  // 13:30 UTC
    if (minuteOfDay < windowStart || minuteOfDay >= windowEnd) {
      return new Response(
        JSON.stringify({ message: 'Outside sending window (03:30–13:30 UTC)', executed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const nowIso = now.toISOString();

    // Fetch enrollments ready to execute
    const { data: enrollments, error: fetchError } = await supabase
      .from('mkt_sequence_enrollments')
      .select(`
        id,
        org_id,
        lead_id,
        campaign_id,
        current_step,
        status
      `)
      .eq('status', 'active')
      .lte('next_action_at', nowIso)
      .order('next_action_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    if (!enrollments || enrollments.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No enrollments due', executed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logger.info('executor-start', { enrollment_count: enrollments.length });

    // Batch-fetch related data
    const campaignIds = [...new Set(enrollments.map((e) => e.campaign_id))];
    const leadIds = [...new Set(enrollments.map((e) => e.lead_id))];

    const [campaignsRes, leadsRes, stepsRes] = await Promise.all([
      supabase.from('mkt_campaigns').select('id, name, status, metadata').in('id', campaignIds),
      supabase.from('contacts').select('id, org_id, email, phone, first_name, last_name, company, status').in('id', leadIds),
      supabase.from('mkt_campaign_steps').select('*').in('campaign_id', campaignIds).eq('is_active', true).order('step_number', { ascending: true }),
    ]);

    const campaignMap = new Map(campaignsRes.data?.map((c) => [c.id, c]) || []);
    const leadMap = new Map(leadsRes.data?.map((l) => [l.id, l]) || []);

    // Group steps by campaign
    const stepsByCampaign = new Map<string, Array<Record<string, unknown>>>();
    for (const step of stepsRes.data || []) {
      const existing = stepsByCampaign.get(step.campaign_id) || [];
      existing.push(step);
      stepsByCampaign.set(step.campaign_id, existing);
    }

    let executed = 0;
    let skipped = 0;
    let completed = 0;
    let failed = 0;

    // Process in parallel batches
    for (let i = 0; i < enrollments.length; i += PARALLEL_SIZE) {
      const batch = enrollments.slice(i, i + PARALLEL_SIZE);

      const results = await Promise.allSettled(
        batch.map((enrollment) =>
          processEnrollment(
            supabase,
            supabaseUrl,
            serviceRoleKey,
            enrollment,
            campaignMap,
            leadMap,
            stepsByCampaign
          )
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value === 'executed') executed++;
          else if (result.value === 'skipped') skipped++;
          else if (result.value === 'completed') completed++;
        } else {
          failed++;
          console.error('[mkt-sequence-executor] Process failed:', result.reason);
        }
      }
    }

    await logger.info('executor-complete', { executed, skipped, completed, failed });

    return new Response(
      JSON.stringify({ message: 'Sequence execution complete', executed, skipped, completed, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await logger.error('executor-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Process a single enrollment: determine step, check channel, dispatch action.
 */
async function processEnrollment(
  supabase: ReturnType<typeof getSupabaseClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  enrollment: Record<string, unknown>,
  campaignMap: Map<string, Record<string, unknown>>,
  leadMap: Map<string, Record<string, unknown>>,
  stepsByCampaign: Map<string, Array<Record<string, unknown>>>
): Promise<'executed' | 'skipped' | 'completed'> {
  const campaign = campaignMap.get(enrollment.campaign_id as string);
  const lead = leadMap.get(enrollment.lead_id as string);

  // Skip if campaign is no longer active
  if (!campaign || campaign.status !== 'active') {
    await supabase
      .from('mkt_sequence_enrollments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'Campaign inactive' })
      .eq('id', enrollment.id as string);
    return 'skipped';
  }

  // Check if product is active (if campaign has a product_key)
  const campaignMeta = (campaign as Record<string, unknown>).metadata as Record<string, unknown> | undefined;
  const productKey = campaignMeta?.product_key as string | undefined;
  if (productKey) {
    const { data: product } = await supabase
      .from('mkt_products')
      .select('active')
      .eq('org_id', enrollment.org_id as string)
      .eq('product_key', productKey)
      .single();

    if (product && !product.active) {
      // Skip this enrollment — product is paused
      return 'skipped';
    }
  }

  // Skip if lead is disqualified or already converted
  if (!lead || lead.status === 'disqualified') {
    await supabase
      .from('mkt_sequence_enrollments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'Lead disqualified' })
      .eq('id', enrollment.id as string);
    return 'skipped';
  }

  // Get the current step
  const steps = stepsByCampaign.get(enrollment.campaign_id as string) || [];
  const currentStepNum = enrollment.current_step as number;
  const step = steps.find((s) => s.step_number === currentStepNum);

  if (!step) {
    // No more steps — mark enrollment as completed
    await supabase
      .from('mkt_sequence_enrollments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', enrollment.id as string);
    return 'completed';
  }

  // Check channel availability via router
  const channelResult = await getNextChannel(
    { id: lead.id as string, org_id: lead.org_id as string, email: lead.email as string | null, phone: lead.phone as string | null },
    { channel: step.channel as string }
  );

  if (!channelResult.allowed) {
    // Log skipped action
    await supabase.from('mkt_sequence_actions').insert({
      org_id: enrollment.org_id as string,
      enrollment_id: enrollment.id as string,
      step_id: step.id as string,
      step_number: currentStepNum,
      channel: step.channel as string,
      status: 'skipped',
      failure_reason: channelResult.reason,
      scheduled_at: new Date().toISOString(),
    });

    // Advance to next step anyway
    await advanceToNextStep(supabase, enrollment, steps, currentStepNum);
    return 'skipped';
  }

  // Check step conditions (e.g., require previous opened)
  const conditions = (step.conditions || {}) as Record<string, boolean>;
  if (conditions.require_previous_opened || conditions.skip_if_replied) {
    const skipResult = await checkStepConditions(supabase, enrollment, currentStepNum, conditions);
    if (skipResult === 'skip') {
      await supabase.from('mkt_sequence_actions').insert({
        org_id: enrollment.org_id as string,
        enrollment_id: enrollment.id as string,
        step_id: step.id as string,
        step_number: currentStepNum,
        channel: channelResult.channel,
        status: 'skipped',
        failure_reason: 'Conditions not met',
        scheduled_at: new Date().toISOString(),
      });
      await advanceToNextStep(supabase, enrollment, steps, currentStepNum);
      return 'skipped';
    }
  }

  // Create the action record
  const { data: action, error: actionError } = await supabase
    .from('mkt_sequence_actions')
    .insert({
      org_id: enrollment.org_id as string,
      enrollment_id: enrollment.id as string,
      step_id: step.id as string,
      step_number: currentStepNum,
      channel: channelResult.channel,
      status: 'pending',
      scheduled_at: new Date().toISOString(),
      variant: step.ab_test_id ? undefined : null, // A/B handled by sender
      metadata: {
        fallback_from: channelResult.reason ? step.channel : undefined,
      },
    })
    .select('id')
    .single();

  if (actionError) throw actionError;

  // Dispatch to the appropriate sender
  const senderMap: Record<string, string> = {
    email: 'mkt-send-email',
    whatsapp: 'mkt-send-whatsapp',
    call: 'mkt-initiate-call',
    sms: 'mkt-send-whatsapp', // SMS goes through WhatsApp for now
  };

  const senderFunction = senderMap[channelResult.channel] || 'mkt-send-email';

  // Invoke the sender function
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${senderFunction}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action_id: action!.id,
        enrollment_id: enrollment.id,
        lead_id: enrollment.lead_id,
        step_id: step.id,
        template_id: step.template_id,
        ab_test_id: step.ab_test_id,
        channel: channelResult.channel,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Sender ${senderFunction} returned ${response.status}: ${errText}`);
    }
  } catch (error) {
    // Mark action as failed
    await supabase
      .from('mkt_sequence_actions')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        failure_reason: error instanceof Error ? error.message : String(error),
      })
      .eq('id', action!.id);
    throw error;
  }

  // Advance to next step
  await advanceToNextStep(supabase, enrollment, steps, currentStepNum);

  return 'executed';
}

/**
 * Advance enrollment to the next step or mark as completed.
 */
async function advanceToNextStep(
  supabase: ReturnType<typeof getSupabaseClient>,
  enrollment: Record<string, unknown>,
  steps: Array<Record<string, unknown>>,
  currentStepNum: number
): Promise<void> {
  const nextStep = steps.find((s) => (s.step_number as number) > currentStepNum);

  if (!nextStep) {
    // No more steps — mark as completed
    await supabase
      .from('mkt_sequence_enrollments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_step: currentStepNum,
      })
      .eq('id', enrollment.id as string);
    return;
  }

  // Schedule the next step
  const delayHours = (nextStep.delay_hours as number) || 0;
  const nextActionAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);

  await supabase
    .from('mkt_sequence_enrollments')
    .update({
      current_step: nextStep.step_number as number,
      next_action_at: nextActionAt.toISOString(),
    })
    .eq('id', enrollment.id as string);
}

/**
 * Check step conditions (require previous opened, skip if replied).
 */
async function checkStepConditions(
  supabase: ReturnType<typeof getSupabaseClient>,
  enrollment: Record<string, unknown>,
  currentStepNum: number,
  conditions: Record<string, boolean>
): Promise<'proceed' | 'skip'> {
  // Get previous actions for this enrollment
  const { data: prevActions } = await supabase
    .from('mkt_sequence_actions')
    .select('step_number, opened_at, clicked_at, replied_at')
    .eq('enrollment_id', enrollment.id as string)
    .lt('step_number', currentStepNum)
    .order('step_number', { ascending: false })
    .limit(5);

  if (!prevActions || prevActions.length === 0) return 'proceed';

  const lastAction = prevActions[0];

  if (conditions.require_previous_opened && !lastAction.opened_at) {
    return 'skip';
  }

  if (conditions.skip_if_replied && prevActions.some((a) => a.replied_at)) {
    return 'skip';
  }

  return 'proceed';
}
