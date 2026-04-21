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

interface ChannelLimits {
  email_per_day: number;
  whatsapp_per_day: number;
  call_per_day: number;
  sms_per_day: number;
}

const DEFAULT_LIMITS: ChannelLimits = {
  email_per_day: 2000,
  whatsapp_per_day: 100,
  call_per_day: 50,
  sms_per_day: 100,
};

/**
 * Determines the best channel for a lead at a given step.
 * Checks: opt-outs, contact info availability, daily send limits.
 */
export async function getNextChannel(
  lead: Lead,
  step: StepConfig
): Promise<ChannelResult> {
  const supabase = getSupabaseClient();

  // Helper: try a specific channel for this lead
  async function tryChannel(ch: string, fallbackReason?: string): Promise<ChannelResult | null> {
    if (await isOptedOut(lead.org_id, lead, ch)) return null;
    if (!hasContactInfo(lead, ch)) return null;
    if (await isDailyLimitExceeded(lead.org_id, ch)) return null;
    return { channel: ch, allowed: true, reason: fallbackReason };
  }

  // 1. Try preferred channel first
  const preferred = await tryChannel(step.channel);
  if (preferred) return preferred;

  // 2. Walk fallback chain: email → whatsapp → call (or whatsapp → email → call, etc.)
  for (const fb of getFallbackChain(step.channel)) {
    const result = await tryChannel(fb, `Fallback from ${step.channel}`);
    if (result) return result;
  }

  // 3. Check if daily limit was the blocker on the preferred channel (signal to stop batch)
  if (await isDailyLimitExceeded(lead.org_id, step.channel)) {
    return { channel: step.channel, allowed: false, reason: `Daily ${step.channel} limit exceeded` };
  }

  return { channel: step.channel, allowed: false, reason: `No reachable channel for ${step.channel}` };
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

  // Check for 'all' channel opt-out or specific channel
  let query = supabase
    .from('mkt_unsubscribes')
    .select('id')
    .eq('org_id', orgId)
    .in('channel', [channel, 'all']);

  // Match by email or lead_id
  if (lead.email) {
    query = query.or(`email.eq.${lead.email},lead_id.eq.${lead.id}`);
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
      // Block addresses that are confirmed invalid or catch-all domains.
      // catch_all domains accept any SMTP connection but silently drop or
      // defer non-existent mailboxes — they generate deferred bounces that
      // erode sender reputation the same way hard bounces do.
      if (lead.email_verification_status === 'invalid') return false;
      if (lead.email_verification_status === 'catch_all') return false;
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
 * Tries each in sequence until one is reachable.
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
 * Check if the daily send limit for a channel has been exceeded.
 */
async function isDailyLimitExceeded(
  orgId: string,
  channel: string
): Promise<boolean> {
  const supabase = getSupabaseClient();

  // Get configured limits
  const limits = await getChannelLimits(orgId);
  const limitKey = `${channel}_per_day` as keyof ChannelLimits;
  const maxPerDay = limits[limitKey] || 100;

  // Count today's sends for this channel
  const today = new Date().toISOString().split('T')[0];

  const { count, error } = await supabase
    .from('mkt_sequence_actions')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('channel', channel)
    .in('status', ['sent', 'delivered', 'pending'])
    .gte('created_at', `${today}T00:00:00Z`);

  if (error) throw new Error(`isDailyLimitExceeded DB error for ${channel}: ${error.message}`);
  return (count || 0) >= maxPerDay;
}

/**
 * Load channel limits from mkt_engine_config.
 * Falls back to defaults if not configured.
 */
async function getChannelLimits(orgId: string): Promise<ChannelLimits> {
  const supabase = getSupabaseClient();

  const { data } = await supabase
    .from('mkt_engine_config')
    .select('config_value')
    .eq('org_id', orgId)
    .eq('config_key', 'channel_limits')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.config_value) {
    return { ...DEFAULT_LIMITS, ...(data.config_value as Partial<ChannelLimits>) };
  }

  return DEFAULT_LIMITS;
}

/**
 * Check multiple channels at once and return the best available.
 * Useful for smart routing when the step allows channel flexibility.
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
