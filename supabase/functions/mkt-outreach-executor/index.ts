import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { processEnrollment } from '../_shared/sequenceProcessor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Constants ─────────────────────────────────────────────────────────────────

// Step-1 (cold outreach) only.
// Cap: 100 delivered/day PER CAMPAIGN — each campaign gets its own independent budget.
// Multiple campaigns with the same product_key each get 100, not shared.
const BATCH_SIZE = 25;
const DAILY_OUTREACH_LIMIT = 100;

// Safety ceiling: never exceed 1.5× delivery target to guard against delayed webhooks.
const MAX_SEND_MULTIPLIER = 1.5;

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const logger = createEngineLogger('mkt-outreach-executor');

  try {
    const supabase       = getSupabaseClient();
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = (req.headers.get('authorization') || '').replace('Bearer ', '')
      || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const now    = new Date();
    const nowIso = now.toISOString();
    const today  = nowIso.split('T')[0];

    // 1. Load campaigns ordered by priority (NULLS LAST so a campaign that
    //    somehow loses its priority still gets sent — last priority, but sent).
    //    The mkt_campaigns_autoassign_priority trigger is the primary safeguard;
    //    this is defense in depth.
    const { data: sequencedCampaigns } = await supabase
      .from('mkt_campaigns')
      .select('id, org_id, status, product_key')
      .order('sequence_priority', { ascending: true, nullsFirst: false });

    const activeCampaigns   = (sequencedCampaigns ?? []).filter((c) => c.status === 'active');
    const activeCampaignIds = activeCampaigns.map((c) => c.id as string);
    const orgId             = (sequencedCampaigns ?? [])[0]?.org_id as string;

    if (activeCampaignIds.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active campaigns', executed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Sending window check
    const windowRow = await supabase
      .from('mkt_engine_config')
      .select('config_value')
      .eq('org_id', orgId)
      .eq('config_key', 'sending_window')
      .maybeSingle();

    const winCfg       = (windowRow.data?.config_value as Record<string, string> | null) ?? {};
    const startUtc     = winCfg.start_utc ?? '03:30';
    const endUtc       = winCfg.end_utc   ?? '13:30';
    const toMin        = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
    const windowStartMin = toMin(startUtc);
    const windowEndMin   = toMin(endUtc);

    const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (minuteOfDay < windowStartMin || minuteOfDay >= windowEndMin) {
      return new Response(
        JSON.stringify({ message: `Outside sending window (${startUtc}–${endUtc} UTC)`, executed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3. Load step-1 IDs for all active campaigns
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

    // 4. Per-campaign cap check — each campaign gets its own 100/day budget independently.
    //    All active campaigns run in parallel (same batch), no staggering.
    const step1Pool: Array<Record<string, unknown>> = [];
    const campaignBudgetLog: Record<string, { delivered: number; inFlight: number; remaining: number }> = {};

    for (const campaign of activeCampaigns) {
      const cid    = campaign.id as string;
      const stepId = step1IdByCampaign.get(cid);
      if (!stepId) continue;

      // Confirmed deliveries for this campaign today
      const { count: dlvdCount } = await supabase
        .from('mkt_sequence_actions')
        .select('id', { count: 'exact', head: true })
        .eq('step_id', stepId)
        .not('delivered_at', 'is', null)
        .gte('created_at', `${today}T00:00:00Z`);

      // In-flight (sent but not yet confirmed) for this campaign today
      const { count: inFlightCount } = await supabase
        .from('mkt_sequence_actions')
        .select('id', { count: 'exact', head: true })
        .eq('step_id', stepId)
        .in('status', ['sent', 'pending'])
        .is('delivered_at', null)
        .gte('created_at', `${today}T00:00:00Z`);

      const delivered = dlvdCount ?? 0;
      const inFlight  = inFlightCount ?? 0;
      const totalSent = delivered + inFlight;
      const safetyMax = Math.floor(DAILY_OUTREACH_LIMIT * MAX_SEND_MULTIPLIER);

      const remaining = delivered >= DAILY_OUTREACH_LIMIT || totalSent >= safetyMax
        ? 0
        : Math.max(0, DAILY_OUTREACH_LIMIT - totalSent);

      campaignBudgetLog[cid] = { delivered, inFlight, remaining };
      if (remaining === 0) continue;

      // Pull up to `remaining` step-1 enrollments due for this campaign
      const { data: pool } = await supabase
        .from('mkt_sequence_enrollments')
        .select('id, org_id, lead_id, campaign_id, current_step, status')
        .eq('status', 'active')
        .eq('current_step', 1)
        .eq('campaign_id', cid)
        .lte('next_action_at', nowIso)
        .order('next_action_at', { ascending: true })
        .limit(remaining);

      step1Pool.push(...(pool ?? []));
    }

    const enrollments = step1Pool.slice(0, BATCH_SIZE);

    if (enrollments.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No cold outreach due', campaign_budgets: campaignBudgetLog, executed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await logger.info('outreach-start', {
      campaign_budgets: campaignBudgetLog,
      step1_due:        step1Pool.length,
      batch:            enrollments.length,
    });

    // 5. Batch-fetch related data
    const campaignIds = [...new Set(enrollments.map((e) => e.campaign_id))];
    const leadIds     = [...new Set(enrollments.map((e) => e.lead_id))];

    const [campaignsRes, leadsRes, stepsRes] = await Promise.all([
      supabase.from('mkt_campaigns').select('id, name, status, product_key').in('id', campaignIds),
      supabase.from('contacts').select('id, org_id, email, phone, first_name, last_name, company, status, email_verification_status').in('id', leadIds),
      supabase.from('mkt_campaign_steps').select('*').in('campaign_id', campaignIds).eq('is_active', true).order('step_number', { ascending: true }),
    ]);

    const campaignMap     = new Map((campaignsRes.data ?? []).map((c) => [c.id, c]));
    const leadMap         = new Map((leadsRes.data ?? []).map((l) => [l.id, l]));
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
        if (result === 'executed')       executed++;
        else if (result === 'skipped')   skipped++;
        else if (result === 'completed') completed++;
        else if (result === 'stop')      { skipped++; }
      } catch (e) {
        failed++;
        console.error('[mkt-outreach-executor] enrollment failed:', e);
        try {
          await supabase
            .from('mkt_sequence_enrollments')
            .update({ next_action_at: new Date(Date.now() + 3_600_000).toISOString() })
            .eq('id', (enrollment as Record<string, unknown>).id as string);
        } catch { /* ignore */ }
      }
    }

    await logger.info('outreach-complete', { executed, skipped, completed, failed });

    // Self-chain: if work was done and window is still open, kick off next batch immediately.
    const minuteOfDayAfter = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
    if (executed > 0 && minuteOfDayAfter < windowEndMin) {
      fetch(`${supabaseUrl}/functions/v1/mkt-outreach-executor`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({ message: 'Cold outreach complete', executed, skipped, completed, failed, campaign_budgets: campaignBudgetLog }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    await logger.error('outreach-fatal', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
