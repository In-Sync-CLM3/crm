import { getSupabaseClient } from './supabaseClient.ts';

interface Lead {
  id: string;
  org_id: string;
  email?: string | null;
  phone?: string | null;
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
  email_per_day: 200,
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

  // 1. Check if lead has opted out of this channel
  const optedOut = await isOptedOut(lead.org_id, lead, step.channel);
  if (optedOut) {
    // Try fallback channel
    const fallback = getFallbackChannel(step.channel);
    if (fallback) {
      const fallbackOptedOut = await isOptedOut(lead.org_id, lead, fallback);
      if (!fallbackOptedOut && hasContactInfo(lead, fallback)) {
        return { channel: fallback, allowed: true, reason: `Fallback from ${step.channel} (opted out)` };
      }
    }
    return { channel: step.channel, allowed: false, reason: `Opted out of ${step.channel}` };
  }

  // 2. Check if lead has the required contact info for this channel
  if (!hasContactInfo(lead, step.channel)) {
    const fallback = getFallbackChannel(step.channel);
    if (fallback && hasContactInfo(lead, fallback)) {
      const fallbackOptedOut = await isOptedOut(lead.org_id, lead, fallback);
      if (!fallbackOptedOut) {
        return { channel: fallback, allowed: true, reason: `Fallback from ${step.channel} (no contact info)` };
      }
    }
    return { channel: step.channel, allowed: false, reason: `No ${step.channel} contact info` };
  }

  // 3. Check daily send limits
  const limitExceeded = await isDailyLimitExceeded(lead.org_id, step.channel);
  if (limitExceeded) {
    return { channel: step.channel, allowed: false, reason: `Daily ${step.channel} limit exceeded` };
  }

  return { channel: step.channel, allowed: true };
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

  const { data } = await query.limit(1);
  return (data?.length || 0) > 0;
}

/**
 * Check if lead has the necessary contact info for a channel.
 */
function hasContactInfo(lead: Lead, channel: string): boolean {
  switch (channel) {
    case 'email':
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
 * Get fallback channel when preferred channel is unavailable.
 */
function getFallbackChannel(channel: string): string | null {
  const fallbacks: Record<string, string> = {
    email: 'whatsapp',
    whatsapp: 'email',
    call: 'email',
    sms: 'whatsapp',
  };
  return fallbacks[channel] || null;
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

  const { count } = await supabase
    .from('mkt_sequence_actions')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('channel', channel)
    .in('status', ['sent', 'delivered', 'pending'])
    .gte('created_at', `${today}T00:00:00Z`);

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
    .single();

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
