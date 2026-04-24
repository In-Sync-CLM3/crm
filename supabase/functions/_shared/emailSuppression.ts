import { getSupabaseClient } from './supabaseClient.ts';

type Supabase = ReturnType<typeof getSupabaseClient>;

/**
 * Number of soft bounces before a contact is hard-suppressed.
 * Single source of truth — both email webhooks read this constant.
 */
export const SOFT_BOUNCE_THRESHOLD = 3;

/**
 * Suppress email channel only — keeps enrollments active so the executor
 * can immediately retry via WhatsApp or call on the next tick.
 * Use this for bounces. Use hardSuppressContact (below) for spam complaints.
 */
export async function suppressEmailRetryOtherChannels(
  supabase: Supabase,
  contactId: string,
  orgId: string,
  email: string | null,
  enrollmentId: string,
  reason: string,
): Promise<void> {
  await supabase
    .from('contacts')
    .update({ email_bounce_type: 'hard', email_bounced_at: new Date().toISOString() })
    .eq('id', contactId);

  if (email) {
    await supabase.from('mkt_unsubscribes').upsert(
      { org_id: orgId, email, channel: 'email', reason, updated_at: new Date().toISOString() },
      { onConflict: 'org_id,email,channel' },
    );
  }

  // Re-queue the enrollment with a 1-hour backoff — executor will route to WhatsApp/call.
  // Using a delay (rather than now) avoids flooding the next cron tick after a bounce.
  await supabase
    .from('mkt_sequence_enrollments')
    .update({ next_action_at: new Date(Date.now() + 3_600_000).toISOString() })
    .eq('id', enrollmentId)
    .eq('status', 'active');
}

/**
 * Permanently suppress a contact from ALL channels.
 * - Marks email_bounce_type = 'hard' on contacts
 * - Upserts into mkt_unsubscribes (keyed by org_id, email, channel)
 * - Cancels all active enrollments
 * Use this for spam complaints only.
 */
export async function hardSuppressContact(
  supabase: Supabase,
  contactId: string,
  orgId: string,
  email: string | null,
  reason: string,
): Promise<void> {
  await supabase
    .from('contacts')
    .update({ email_bounce_type: 'hard', email_bounced_at: new Date().toISOString() })
    .eq('id', contactId);

  if (email) {
    await supabase.from('mkt_unsubscribes').upsert(
      { org_id: orgId, email, channel: 'email', reason, updated_at: new Date().toISOString() },
      { onConflict: 'org_id,email,channel' },
    );
  }

  await supabase
    .from('mkt_sequence_enrollments')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'Spam complaint' })
    .eq('lead_id', contactId)
    .eq('status', 'active');
}

/**
 * Handle a soft bounce: increment counter, escalate at SOFT_BOUNCE_THRESHOLD.
 * On escalation, suppresses email only and re-queues for other-channel retry.
 */
export async function softBounceContact(
  supabase: Supabase,
  contactId: string,
  orgId: string,
  email: string | null,
  enrollmentId: string,
): Promise<void> {
  const { data: contact } = await supabase
    .from('contacts')
    .select('email_soft_bounce_count, email_bounce_type')
    .eq('id', contactId)
    .single();

  // Already hard-suppressed — nothing more to do
  if (contact?.email_bounce_type === 'hard') return;

  const newCount = (contact?.email_soft_bounce_count || 0) + 1;
  const escalate = newCount >= SOFT_BOUNCE_THRESHOLD;

  await supabase
    .from('contacts')
    .update({
      email_soft_bounce_count: newCount,
      email_bounce_type: escalate ? 'hard' : 'soft',
      email_bounced_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  if (escalate) {
    await suppressEmailRetryOtherChannels(supabase, contactId, orgId, email, enrollmentId, 'soft_bounce_escalated');
  }
}

/**
 * Suppress a contact looked up by email address (for verification bounce events
 * where there is no action_id — only the recipient email is known).
 */
export async function suppressContactByEmail(
  supabase: Supabase,
  email: string,
): Promise<{ suppressed: boolean; contactId?: string }> {
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, org_id')
    .eq('email', email)
    .is('email_bounce_type', null)
    .maybeSingle();

  if (!contact) return { suppressed: false };

  await supabase
    .from('contacts')
    .update({
      email_verification_status: 'invalid',
      email_bounce_type: 'hard',
      email_bounced_at: new Date().toISOString(),
    })
    .eq('id', contact.id);

  await supabase
    .from('mkt_sequence_enrollments')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: 'Hard bounce — email invalid (verification send)',
    })
    .eq('lead_id', contact.id)
    .eq('status', 'active');

  return { suppressed: true, contactId: contact.id };
}
