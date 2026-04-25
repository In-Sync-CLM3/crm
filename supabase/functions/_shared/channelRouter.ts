import { getSupabaseClient } from './supabaseClient.ts';

interface Lead {
  id: string;
  org_id: string;
  email?: string | null;
  phone?: string | null;
  email_verification_status?: string | null;
}

interface StepConfig {
  channel: string;
  // email | whatsapp | call | sms
}

interface ChannelResult {
  channel: string;
  allowed: boolean;
  reason?: string;
}

/**
 * Determines the best channel for a lead at a given step.
 * Checks: opt-outs, contact info availability, and milestone gates.
 * Daily send limits are managed by the sequence executor (per-product, not here).
 */
export async function getNextChannel(
  lead: Lead,
  step: StepConfig
): Promise<ChannelResult> {
  const supabase = getSupabaseClient();

  // Milestone gate: call channel requires M3 (10 paying clients).
  // If Vapi is not yet active, treat 'call' steps as if the channel is unavailable
  // and fall through immediately to the fallback chain (whatsapp → email).
  let effectiveChannel = step.channel;
  if (step.channel === 'call') {
    const { data: vapiChannel } = await supabase
      .from('mkt_channels')
      .select('active')
      .eq('channel_key', 'vapi')
      .maybeSingle();
    if (!vapiChannel?.active) {
      effectiveChannel = 'email'; // skip to fallback chain starting point
    }
  }

  // Helper: try a specific channel for this lead
  async function tryChannel(ch: string, fallbackReason?: string): Promise<ChannelResult | null> {
    if (await isOptedOut(lead.org_id, lead, ch)) return null;
    if (!hasContactInfo(lead, ch)) return null;
    return { channel: ch, allowed: true, reason: fallbackReason };
  }

  // 1. Try preferred channel first (may have been overridden above)
  const preferred = await tryChannel(effectiveChannel);
  if (preferred) return preferred;

  // 2. Walk fallback chain: email → whatsapp → call (or whatsapp → email → call, etc.)
  for (const fb of getFallbackChain(effectiveChannel)) {
    const result = await tryChannel(fb, `Fallback from ${step.channel}`);
    if (result) return result;
  }

  return { channel: effectiveChannel, allowed: false, reason: `No reachable channel for ${step.channel}` };
}

/**
 * Check if a lead has opted out of a specific channel.
 */
async function isOptedOut(
  orgId: string,
  lead: Lead,
  channel: string
): Promise<boolean> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('mkt_unsubscribes')
    .select('id')
    .eq('org_id', orgId)
    .in('channel', [channel, 'all']);

  if (lead.email) {
    // Some contacts store multiple emails as comma-separated values.
    // Use only the first email to avoid breaking the PostgREST or() filter.
    const primaryEmail = lead.email.split(',')[0].trim();
    query = query.or(`email.eq.${primaryEmail},lead_id.eq.${lead.id}`);
  } else {
    query = query.eq('lead_id', lead.id);
  }

  const { data, error } = await query.limit(1);
  if (error) throw new Error(`isOptedOut DB error for lead ${lead.id}: ${error.message}`);
  return (data?.length || 0) > 0;
}

/**
 * Check if lead has the necessary contact info for a channel.
 */
function hasContactInfo(lead: Lead, channel: string): boolean {
  switch (channel) {
    case 'email':
      if (lead.email_verification_status === 'invalid') return false;
      return !!lead.email;
    case 'whatsapp':
    case 'call':
    case 'sms':
      return !!lead.phone;
    default:
      return false;
  }
}

/**
 * Ordered fallback chain when preferred channel is unavailable.
 */
function getFallbackChain(channel: string): string[] {
  const chains: Record<string, string[]> = {
    email:    ['whatsapp', 'call'],
    whatsapp: ['email', 'call'],
    call:     ['whatsapp', 'email'],
    sms:      ['whatsapp', 'email'],
  };
  return chains[channel] || [];
}

/**
 * Check multiple channels at once and return the best available.
 */
export async function getBestAvailableChannel(
  lead: Lead,
  preferredOrder: string[] = ['email', 'whatsapp', 'call']
): Promise<ChannelResult> {
  for (const channel of preferredOrder) {
    const result = await getNextChannel(lead, { channel });
    if (result.allowed) return result;
  }

  return {
    channel: preferredOrder[0] || 'email',
    allowed: false,
    reason: 'No available channel',
  };
}
