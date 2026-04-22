import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { getNextChannel } from '../_shared/channelRouter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Constants ────────────────────────────────────────────────────────────────

// Batch size: 25 sends × ~3 s each ≈ 75 s — comfortably under the 150 s idle timeout.
// Self-chain removed: the pg_cron heartbeat (job #26, every 5 min) is the sole
// trigger. This eliminates concurrent-run double-send risk while still delivering
// 300 sends/hour (25 × 12 runs) — enough for all active campaigns in the window.
// If an invocation crashes or times out mid-batch, unprocessed enrollments keep
// their old next_action_at (in the past) and are auto-recovered on the next cron tick.
const BATCH_SIZE = 25;


// Campaign sequence order is read from mkt_campaigns.sequence_priority at runtime.
// To change the order or add/remove campaigns, update that column — no code change needed.

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const logger = createEngineLogger('mkt-sequence-executor');

  try {
    const supabase      = getSupabaseClient();
    const supabaseUrl   = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = (req.headers.get('authorization') || '').replace('Bearer ', '')
      || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const now    = new Date();
    const nowIso = now.toISOString();
    const today  = nowIso.split('T')[0];


    // 1. Load campaign sequence order + org_id + product_key from mkt_campaigns.
    const { data: sequencedCampaigns } = await supabase
      .from('mkt_campaigns')
      .select('id, org_id, status, product_key')
      .not('sequence_priority', 'is', null)
      .order('sequence_priority', { ascending: true });

    const activeCampaigns = (sequencedCampaigns ?? []).filter((c) => c.status === 'active');
    const activeCampaignIds = activeCampaigns.map((c) => c.id as string);
    const orgId = (sequencedCampaigns ?? [])[0]?.org_id as string;

    if (activeCampaignIds.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active campaigns with sequence_priority set', executed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Load sending window config only.
    const windowRow = await supabase
      .from('mkt_engine_config')
      .select('config_value')
      .eq('org_id', orgId)
      .eq('config_key', 'sending_window')
      .maybeSingle();

    // Parse sending window — defaults to 03:30–13:30 UTC (09:00–19:00 IST)
    const winCfg = (windowRow.data?.config_value as Record<string, string> | null) ?? {};
    const startUtc = winCfg.start_utc ?? '03:30';
    const endUtc   = winCfg.end_utc   ?? '13:30';
    const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
    const windowStartMin = toMin(startUtc);
    const windowEndMin   = toMin(endUtc);

    // 3. Sending window check
    const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (minuteOfDay < windowStartMin || minuteOfDay >= windowEndMin) {
      return new Response(
        JSON.stringify({ message: `Outside sending window (${startUtc}–${endUtc} UTC)`, executed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. Per-product daily outreach limit: 100 delivered+sent per product per day.
    //    Applies to step-1 (new outreach) only. Follow-ups are always unlimited.
    //
    //    "Delivered" = confirmed by Resend webhook. "Sent" = in-flight (not yet confirmed).
    //    Counting both prevents oversending while Resend delivery webhooks are still pending.
    const DAILY_OUTREACH_LIMIT = 100;

    // Load step-1 IDs for all active campaigns
    const { data: step1Rows } = await supabase
      .from('mkt_campaign_steps')
      .select('id, campaign_id')
      .in('campaign_id', activeCampaignIds)
      .eq('step_number', 1)
      .eq('is_active', true);

    const step1IdByCampaign = new Map<string, string>();
    for (const row of step1Rows || []) {
      step1IdByCampaign.set(row.campaign_id as string, row.id as string);
    }

    // Group campaigns by product_key
    const campaignsByProduct = new Map<string, string[]>(); // product_key → campaign_ids
    for (const c of activeCampaigns) {
      const pk = (c.product_key as string) || '_unkeyed';
      const arr = campaignsByProduct.get(pk) ?? [];
      arr.push(c.id as string);
      campaignsByProduct.set(pk, arr);
    }

    // Count today's step-1 sent+delivered per product
    const step1SentTodayByProduct = new Map<string, number>();
    for (const [productKey, campIds] of campaignsByProduct.entries()) {
      const stepIds = campIds.map((cid) => step1IdByCampaign.get(cid)).filter(Boolean) as string[];
      if (stepIds.length === 0) { step1SentTodayByProduct.set(productKey, 0); continue; }

      const { count } = await supabase
        .from('mkt_sequence_actions')
        .select('id', { count: 'exact', head: true })
        .in('step_id', stepIds)
        .in('status', ['sent', 'delivered', 'pending'])
        .gte('created_at', `${today}T00:00:00Z`);

      step1SentTodayByProduct.set(productKey, count ?? 0);
    }

    // Build step-1 pool: for each product not yet at limit, pull due enrollments
    const step1Pool: Array<Record<string, unknown>> = [];
    const productBudgetLog: Record<string, number> = {};

    for (const [productKey, campIds] of campaignsByProduct.entries()) {
      const sentToday = step1SentTodayByProduct.get(productKey) ?? 0;
      const remaining = Math.max(0, DAILY_OUTREACH_LIMIT - sentToday);
      productBudgetLog[productKey] = remaining;
      if (remaining === 0) continue;

      // Distribute remaining slots evenly across campaigns in this product
      const slotsEach = Math.max(1, Math.ceil(remaining / campIds.length));

      for (const cid of campIds) {
        const stepId = step1IdByCampaign.get(cid);
        if (!stepId) continue;

        const { data: pool } = await supabase
          .from('mkt_sequence_enrollments')
          .select('id, org_id, lead_id, campaign_id, current_step, status')
          .eq('status', 'active')
          .eq('current_step', 1)
          .eq('campaign_id', cid)
          .lte('next_action_at', nowIso)
          .order('next_action_at', { ascending: true })
          .limit(Math.min(remaining, slotsEach));

        step1Pool.push(...(pool ?? []));
      }
    }

    // 4b. Follow-ups (step > 1) — always run, no daily cap
    const { data: followupPool } = await supabase
      .from('mkt_sequence_enrollments')
      .select('id, org_id, lead_id, campaign_id, current_step, status')
      .eq('status', 'active')
      .gt('current_step', 1)
      .lte('next_action_at', nowIso)
      .order('next_action_at', { ascending: true })
      .limit(BATCH_SIZE);

    const followups = followupPool ?? [];

    // Combine: follow-ups first (time-sensitive), then step-1. Total ≤ BATCH_SIZE.
    const enrollments = [...followups, ...step1Pool].slice(0, BATCH_SIZE);

    if (enrollments.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No enrollments due', product_budgets: productBudgetLog, executed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await logger.info('executor-start', {
      product_budgets:   productBudgetLog,
      followups_due:     followups.length,
      step1_due:         step1Pool.length,
      batch:             enrollments.length,
    });

    // 5. Batch-fetch related data
    const campaignIds = [...new Set(enrollments.map((e) => e.campaign_id))];
    const leadIds     = [...new Set(enrollments.map((e) => e.lead_id))];

    const [campaignsRes, leadsRes, stepsRes] = await Promise.all([
      supabase
        .from('mkt_campaigns')
        .select('id, name, status, product_key')
        .in('id', campaignIds),
      supabase
        .from('contacts')
        .select('id, org_id, email, phone, first_name, last_name, company, status, email_verification_status')
        .in('id', leadIds),
      supabase
        .from('mkt_campaign_steps')
        .select('*')
        .in('campaign_id', campaignIds)
        .eq('is_active', true)
        .order('step_number', { ascending: true }),
    ]);

    const campaignMap    = new Map((campaignsRes.data ?? []).map((c) => [c.id, c]));
    const leadMap        = new Map((leadsRes.data ?? []).map((l) => [l.id, l]));
    const stepsByCampaign = new Map<string, Array<Record<string, unknown>>>();
    for (const step of stepsRes.data ?? []) {
      const arr = stepsByCampaign.get(step.campaign_id) ?? [];
      arr.push(step);
      stepsByCampaign.set(step.campaign_id, arr);
    }

    // 6. Process sequentially
    let executed = 0, skipped = 0, completed = 0, failed = 0;

    for (const enrollment of enrollments) {
      try {
        const result = await processEnrollment(
          supabase, supabaseUrl, serviceRoleKey,
          enrollment, campaignMap, leadMap, stepsByCampaign,
        );
        if (result === 'executed')  executed++;
        else if (result === 'skipped')   skipped++;
        else if (result === 'completed') completed++;
        else if (result === 'stop')      { skipped++; } // daily limit for this channel — skip this enrollment, continue batch
      } catch (e) {
        failed++;
        console.error('[mkt-sequence-executor] enrollment failed:', e);
      }
    }

    await logger.info('executor-complete', { executed, skipped, completed, failed });

    // Self-chain: if work was done and window is still open, immediately kick off the next batch.
    // Each batch advances next_action_at before we chain, so there is no double-send risk.
    const minuteOfDayAfter = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
    if (executed > 0 && minuteOfDayAfter < windowEndMin) {
      fetch(`${supabaseUrl}/functions/v1/mkt-sequence-executor`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      }).catch(() => {}); // fire-and-forget
    }

    return new Response(
      JSON.stringify({ message: 'Sequence execution complete', executed, skipped, completed, failed, product_budgets: productBudgetLog }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    await logger.error('executor-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ── processEnrollment ─────────────────────────────────────────────────────────

async function processEnrollment(
  supabase:        ReturnType<typeof getSupabaseClient>,
  supabaseUrl:     string,
  serviceRoleKey:  string,
  enrollment:      Record<string, unknown>,
  campaignMap:     Map<string, Record<string, unknown>>,
  leadMap:         Map<string, Record<string, unknown>>,
  stepsByCampaign: Map<string, Array<Record<string, unknown>>>,
): Promise<'executed' | 'skipped' | 'completed' | 'stop'> {

  const campaign = campaignMap.get(enrollment.campaign_id as string);
  const lead     = leadMap.get(enrollment.lead_id as string);

  // Cancel if campaign is no longer active
  if (!campaign || campaign.status !== 'active') {
    await supabase
      .from('mkt_sequence_enrollments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'Campaign inactive' })
      .eq('id', enrollment.id as string);
    return 'skipped';
  }

  // Freeze for 4 h if the product has been toggled off
  const productKey = campaign.product_key as string | undefined;

  if (productKey) {
    const { data: product } = await supabase
      .from('mkt_products')
      .select('active')
      .eq('org_id', enrollment.org_id as string)
      .eq('product_key', productKey)
      .single();

    if (product && !product.active) {
      await supabase
        .from('mkt_sequence_enrollments')
        .update({ next_action_at: new Date(Date.now() + 4 * 3600_000).toISOString() })
        .eq('id', enrollment.id as string);
      return 'skipped';
    }
  }

  // Cancel if lead is disqualified
  if (!lead || lead.status === 'disqualified') {
    await supabase
      .from('mkt_sequence_enrollments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'Lead disqualified' })
      .eq('id', enrollment.id as string);
    return 'skipped';
  }

  // Find the current step
  const steps          = stepsByCampaign.get(enrollment.campaign_id as string) ?? [];
  const currentStepNum = enrollment.current_step as number;
  const step           = steps.find((s) => s.step_number === currentStepNum);

  if (!step) {
    await supabase
      .from('mkt_sequence_enrollments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', enrollment.id as string);
    return 'completed';
  }

  // Determine channel
  const channelResult = await getNextChannel(
    { id: lead.id as string, org_id: lead.org_id as string, email: lead.email as string | null, phone: lead.phone as string | null },
    { channel: step.channel as string },
  );

  if (!channelResult.allowed) {
    // Daily rate limit hit — stop this batch cleanly without touching the enrollment.
    // The enrollment stays due and will be retried on the next run / tomorrow.
    if ((channelResult.reason ?? '').toLowerCase().includes('limit')) {
      return 'stop';
    }

    // No reachable channel on any fallback — contact is unreachable permanently.
    // Cancel the enrollment immediately instead of stepping through every remaining
    // step just to skip each one (hard bounce + no phone = dead end).
    await supabase
      .from('mkt_sequence_enrollments')
      .update({
        status:       'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: channelResult.reason ?? 'No reachable channel',
      })
      .eq('id', enrollment.id as string);
    return 'skipped';
  }

  // Check step conditions
  const conditions = (step.conditions ?? {}) as Record<string, boolean>;
  if (conditions.require_previous_opened || conditions.skip_if_replied) {
    const check = await checkStepConditions(supabase, enrollment, currentStepNum, conditions);
    if (check === 'skip') {
      await supabase.from('mkt_sequence_actions').insert({
        org_id:       enrollment.org_id as string,
        enrollment_id: enrollment.id as string,
        step_id:      step.id as string,
        step_number:  currentStepNum,
        channel:      channelResult.channel,
        status:       'skipped',
        failure_reason: 'Conditions not met',
        scheduled_at: new Date().toISOString(),
      });
      await advanceToNextStep(supabase, enrollment, steps, currentStepNum);
      return 'skipped';
    }
  }

  // Create action record
  const { data: action, error: actionError } = await supabase
    .from('mkt_sequence_actions')
    .insert({
      org_id:       enrollment.org_id as string,
      enrollment_id: enrollment.id as string,
      step_id:      step.id as string,
      step_number:  currentStepNum,
      channel:      channelResult.channel,
      status:       'pending',
      scheduled_at: new Date().toISOString(),
      variant:      step.ab_test_id ? undefined : null,
      metadata: {
        fallback_from: channelResult.reason ? step.channel : undefined,
      },
    })
    .select('id')
    .single();

  if (actionError) throw actionError;

  // Resolve template — when falling back from email to WhatsApp, look up the
  // product's WhatsApp template by step number; the email template_id is invalid
  // in mkt_whatsapp_templates.
  let effectiveTemplateId = step.template_id;
  if (channelResult.channel === 'whatsapp' && step.channel !== 'whatsapp' && productKey) {
    const stepTypeMap: Record<number, string> = { 1: 'welcome', 2: 'feature-highlight', 3: 'trial-reminder', 4: 'reactivation' };
    const stepType = stepTypeMap[step.step_number as number] ?? 'welcome';

    const { data: waTemplate } = await supabase
      .from('mkt_whatsapp_templates')
      .select('id')
      .eq('name', `${productKey}-wa-${stepType}`)
      .eq('is_active', true)
      .maybeSingle();

    if (waTemplate) {
      effectiveTemplateId = waTemplate.id;
    } else {
      const { data: anyWa } = await supabase
        .from('mkt_whatsapp_templates')
        .select('id')
        .like('name', `${productKey}-wa-%`)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (anyWa) {
        effectiveTemplateId = anyWa.id;
      } else {
        // No WhatsApp template found for this product — sending would silently fail.
        // Mark action skipped and advance so the enrollment doesn't get stuck.
        await supabase.from('mkt_sequence_actions')
          .update({ status: 'skipped', failure_reason: `No WhatsApp template for product ${productKey}` })
          .eq('id', action!.id);
        await advanceToNextStep(supabase, enrollment, steps, currentStepNum);
        return 'skipped';
      }
    }
  }

  // Dispatch to sender
  const senderMap: Record<string, string> = {
    email:    'mkt-send-email',
    whatsapp: 'mkt-send-whatsapp',
    call:     'mkt-initiate-call',
    sms:      'mkt-send-whatsapp',
  };
  const senderFn = senderMap[channelResult.channel] ?? 'mkt-send-email';

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${senderFn}`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        action_id:    action!.id,
        enrollment_id: enrollment.id,
        lead_id:      enrollment.lead_id,
        step_id:      step.id,
        campaign_id:  enrollment.campaign_id,
        campaign_name: campaign.name as string | undefined,
        template_id:  effectiveTemplateId,
        ab_test_id:   step.ab_test_id,
        channel:      channelResult.channel,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Sender ${senderFn} returned ${res.status}: ${errText}`);
    }
  } catch (error) {
    await supabase
      .from('mkt_sequence_actions')
      .update({ status: 'failed', failed_at: new Date().toISOString(), failure_reason: error instanceof Error ? error.message : String(error) })
      .eq('id', action!.id);
    throw error;
  }

  await advanceToNextStep(supabase, enrollment, steps, currentStepNum);
  return 'executed';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function advanceToNextStep(
  supabase:    ReturnType<typeof getSupabaseClient>,
  enrollment:  Record<string, unknown>,
  _steps:      Array<Record<string, unknown>>,
  currentStep: number,
): Promise<void> {
  await supabase.rpc('advance_enrollment_step', {
    p_enrollment_id: enrollment.id as string,
    p_current_step:  currentStep,
  });
}

async function checkStepConditions(
  supabase:    ReturnType<typeof getSupabaseClient>,
  enrollment:  Record<string, unknown>,
  currentStep: number,
  conditions:  Record<string, boolean>,
): Promise<'proceed' | 'skip'> {
  const { data: prev } = await supabase
    .from('mkt_sequence_actions')
    .select('step_number, opened_at, replied_at')
    .eq('enrollment_id', enrollment.id as string)
    .lt('step_number', currentStep)
    .order('step_number', { ascending: false })
    .limit(5);

  if (!prev || prev.length === 0) return 'proceed';

  if (conditions.require_previous_opened && !prev[0].opened_at)            return 'skip';
  if (conditions.skip_if_replied && prev.some((a) => a.replied_at))        return 'skip';

  return 'proceed';
}
