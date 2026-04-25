import { getSupabaseClient } from './supabaseClient.ts';
import { getNextChannel } from './channelRouter.ts';

// ── processEnrollment ─────────────────────────────────────────────────────────
// Shared by mkt-sequence-executor (follow-ups) and mkt-outreach-executor (step-1).

export async function processEnrollment(
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

  const productKey = campaign.product_key as string | undefined;

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
    if ((channelResult.reason ?? '').toLowerCase().includes('limit')) {
      return 'stop';
    }

    // No reachable channel on any fallback — contact is unreachable permanently.
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

  // Clean up orphaned pending actions from previous runs.
  await supabase
    .from('mkt_sequence_actions')
    .update({ status: 'failed', failed_at: new Date().toISOString(), failure_reason: 'Orphaned pending — cleaned up on retry' })
    .eq('enrollment_id', enrollment.id as string)
    .eq('step_number', currentStepNum)
    .eq('status', 'pending');

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
  // product's WhatsApp template by step number.
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
    const errMsg = error instanceof Error ? error.message : String(error);
    await supabase
      .from('mkt_sequence_actions')
      .update({ status: 'failed', failed_at: new Date().toISOString(), failure_reason: errMsg })
      .eq('id', action!.id);

    const MAX_STEP_RETRIES = 3;
    const { data: failedRows } = await supabase
      .from('mkt_sequence_actions')
      .select('id')
      .eq('enrollment_id', enrollment.id as string)
      .eq('step_number', currentStepNum)
      .eq('status', 'failed')
      .limit(MAX_STEP_RETRIES + 1);

    if ((failedRows?.length ?? 0) >= MAX_STEP_RETRIES) {
      await advanceToNextStep(supabase, enrollment, steps, currentStepNum);
    } else {
      await supabase
        .from('mkt_sequence_enrollments')
        .update({ next_action_at: new Date(Date.now() + 3_600_000).toISOString() })
        .eq('id', enrollment.id as string);
    }
    return 'skipped';
  }

  await advanceToNextStep(supabase, enrollment, steps, currentStepNum);
  return 'executed';
}

export async function advanceToNextStep(
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
