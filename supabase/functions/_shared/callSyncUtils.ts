import { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';

/**
 * Parse Exotel IST timestamps to UTC ISO strings.
 * Exotel sends times in IST (UTC+5:30).
 */
export function parseExotelTime(timeStr: string | null): string | null {
  if (!timeStr) return null;
  const istDate = new Date(timeStr + ' GMT+0530');
  return istDate.toISOString();
}

/**
 * Check if a call status is terminal (no further updates expected).
 */
export function isTerminalStatus(status: string): boolean {
  return (
    ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(status) ||
    status.startsWith('completed') ||
    status.startsWith('failed')
  );
}

/**
 * Format call duration for display in activity descriptions.
 */
export function formatCallDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * Build the update payload for a call_log row from Exotel call data.
 */
export function buildCallLogUpdate(call: Record<string, any>) {
  return {
    status: call.Status?.toLowerCase() || 'unknown',
    call_duration: call.Duration ? parseInt(call.Duration) : null,
    conversation_duration: call.ConversationDuration ? parseInt(call.ConversationDuration) : null,
    started_at: parseExotelTime(call.StartTime),
    answered_at: parseExotelTime(call.AnswerTime),
    ended_at: parseExotelTime(call.EndTime),
    recording_url: call.RecordingUrl,
    exotel_raw_data: call,
  };
}

/**
 * Create a contact_activities record for a completed call and link it to the call_log.
 */
export async function createCallActivity(
  supabase: SupabaseClient,
  opts: {
    orgId: string;
    contactId: string;
    agentId?: string | null;
    callLogId: string;
    callSid: string;
    callType: 'inbound' | 'outbound';
    callStatus: string;
    conversationDuration: number;
    endTime: string | null;
  }
): Promise<boolean> {
  const formattedDuration = formatCallDuration(opts.conversationDuration);
  const callLabel = opts.callType === 'inbound' ? 'Inbound' : 'Outbound';

  const { data: activity, error } = await supabase
    .from('contact_activities')
    .insert({
      org_id: opts.orgId,
      contact_id: opts.contactId,
      activity_type: 'call',
      subject: `${callLabel} call - ${opts.callStatus}`,
      description: `Call duration: ${formattedDuration}. Recording synced from Exotel.`,
      created_by: opts.agentId,
      completed_at: opts.endTime || new Date().toISOString(),
      call_duration: opts.conversationDuration,
    })
    .select('id')
    .single();

  if (activity && !error) {
    await supabase
      .from('call_logs')
      .update({ activity_id: activity.id })
      .eq('id', opts.callLogId);
    return true;
  }

  if (error) {
    console.error(`Failed to create activity for call ${opts.callSid}:`, error);
  }
  return false;
}

/**
 * Close stuck agent_call_sessions for a terminal call.
 */
export async function closeStuckSessions(
  supabase: SupabaseClient,
  callSid: string,
  endTime: string | null
): Promise<void> {
  await supabase
    .from('agent_call_sessions')
    .update({
      status: 'ended',
      ended_at: endTime || new Date().toISOString(),
    })
    .eq('exotel_call_sid', callSid)
    .neq('status', 'ended');
}
