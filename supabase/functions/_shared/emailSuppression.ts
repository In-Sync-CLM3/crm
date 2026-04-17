import { getSupabaseClient } from './supabaseClient.ts';

type Supabase = ReturnType<typeof getSupabaseClient>;

/**
 * Number of soft bounces before a contact is hard-suppressed.
 * Single source of truth — both email webhooks read this constant.
 */
export const SOFT_BOUNCE_THRESHOLD = 3;

/**
 * Permanently suppress a contact from email sending.
 * - Marks email_bounce_type = 'hard' on contacts
 * - Upserts into mkt_unsubscribes (keyed by org_id, email, channel)
 * - Cancels all active enrollments
 */
export async function hardSuppressContact(
  supabase: Supabase,
  contactId: string,
  orgId: string,
  email: string | null,
  reason: string,
): Promise<void> {
  const cancelReason = reason === 'spam_complaint'
    ? 'Spam complaint'
    : 'Hard bounce — email undeliverable';

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
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: cancelReason })
    .eq('lead_id', contactId)
    .eq('status', 'active');
}

/**
 * Handle a soft bounce: increment counter, escalate to hard-suppress at SOFT_BOUNCE_THRESHOLD.
 */
export async function softBounceContact(
  supabase: Supabase,
  contactId: string,
  orgId: string,
  email: string | null,
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
    await hardSuppressContact(supabase, contactId, orgId, email, 'soft_bounce_escalated');
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
