import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';
import { processEnrollment } from '../_shared/sequenceProcessor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Constants ─────────────────────────────────────────────────────────────────

// Follow-ups only (step > 1). No daily cap — follow-ups are always sent.
// Batch size: 25 sends × ~3 s each ≈ 75 s — under the 150 s idle timeout.
// Step-1 cold outreach is handled by mkt-outreach-executor (separate cron).
const BATCH_SIZE = 25;

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const logger = createEngineLogger('mkt-sequence-executor');

  try {
    const supabase       = getSupabaseClient();
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = (req.headers.get('authorization') || '').replace('Bearer ', '')
      || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const now    = new Date();
    const nowIso = now.toISOString();

    // 1. Load campaigns ordered by priority (NULLS LAST so a campaign that
    //    somehow loses its priority still gets follow-ups sent — last
    //    priority, but processed). The mkt_campaigns_autoassign_priority
    //    trigger is the primary safeguard; this is defense in depth.
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

    // 3. Follow-ups pool (step > 1) — always uncapped, time-sensitive
    const { data: followupPool } = await supabase
      .from('mkt_sequence_enrollments')
      .select('id, org_id, lead_id, campaign_id, current_step, status')
      .eq('status', 'active')
      .gt('current_step', 1)
      .in('campaign_id', activeCampaignIds)
      .lte('next_action_at', nowIso)
      .order('next_action_at', { ascending: true })
      .limit(BATCH_SIZE);

    const enrollments = followupPool ?? [];

    if (enrollments.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No follow-ups due', executed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await logger.info('executor-start', {
      followups_due: enrollments.length,
      batch:         enrollments.length,
    });

    // 4. Batch-fetch related data
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

    // 5. Process sequentially
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
        console.error('[mkt-sequence-executor] enrollment failed:', e);
        try {
          await supabase
            .from('mkt_sequence_enrollments')
            .update({ next_action_at: new Date(Date.now() + 3_600_000).toISOString() })
            .eq('id', (enrollment as Record<string, unknown>).id as string);
        } catch { /* ignore */ }
      }
    }

    await logger.info('executor-complete', { executed, skipped, completed, failed });

    // Self-chain: if work was done and window is still open, kick off next batch.
    const minuteOfDayAfter = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
    if (executed > 0 && minuteOfDayAfter < windowEndMin) {
      fetch(`${supabaseUrl}/functions/v1/mkt-sequence-executor`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({ message: 'Follow-up execution complete', executed, skipped, completed, failed }),
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
