import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { jsonResponse, errorResponse, handleCors } from '../_shared/responseHelpers.ts';
import {
  parseExotelTime,
  isTerminalStatus,
  buildCallLogUpdate,
  createCallActivity,
  closeStuckSessions,
} from '../_shared/callSyncUtils.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabaseClient = getSupabaseClient();

    // Get all active Exotel settings
    const { data: allSettings } = await supabaseClient
      .from('exotel_settings')
      .select('*')
      .eq('is_active', true);

    if (!allSettings || allSettings.length === 0) {
      return jsonResponse({ message: 'No active Exotel configurations found' });
    }

    const results = [];

    for (const settings of allSettings) {
      try {
        // Get calls from last 7 days
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);

        const exotelUrl = `https://${settings.subdomain}/v1/Accounts/${settings.account_sid}/Calls.json`;
        const auth = btoa(`${settings.api_key}:${settings.api_token}`);

        const response = await fetch(
          `${exotelUrl}?StartTime>=${fromDate.toISOString()}&PageSize=100`,
          { headers: { 'Authorization': `Basic ${auth}` } }
        );

        if (!response.ok) {
          console.error(`Failed to fetch calls for org ${settings.org_id}`);
          results.push({ org_id: settings.org_id, status: 'error', error: await response.text() });
          continue;
        }

        const data = await response.json();
        const calls = data.Calls || [];

        let syncedCount = 0;
        let activitiesCreated = 0;

        for (const call of calls) {
          const { data: existingLog } = await supabaseClient
            .from('call_logs')
            .select('id, activity_id, contact_id, agent_id, org_id')
            .eq('exotel_call_sid', call.Sid)
            .single();

          const callStatus = call.Status?.toLowerCase() || 'unknown';
          const isTerminal = isTerminalStatus(callStatus);

          if (existingLog) {
            // Update existing log
            await supabaseClient
              .from('call_logs')
              .update(buildCallLogUpdate(call))
              .eq('id', existingLog.id);

            // Create missing contact activity for terminal calls
            if (isTerminal && !existingLog.activity_id && existingLog.contact_id) {
              const created = await createCallActivity(supabaseClient, {
                orgId: existingLog.org_id,
                contactId: existingLog.contact_id,
                agentId: existingLog.agent_id,
                callLogId: existingLog.id,
                callSid: call.Sid,
                callType: call.Direction?.includes('incoming') ? 'inbound' : 'outbound',
                callStatus,
                conversationDuration: call.ConversationDuration ? parseInt(call.ConversationDuration) : 0,
                endTime: parseExotelTime(call.EndTime),
              });
              if (created) activitiesCreated++;
            }

            // Close stuck sessions
            if (isTerminal) {
              await closeStuckSessions(supabaseClient, call.Sid, parseExotelTime(call.EndTime));
            }
          } else {
            // Try to match contact by phone number
            const { data: contact } = await supabaseClient
              .from('contacts')
              .select('id')
              .eq('org_id', settings.org_id)
              .eq('phone', call.To || call.From)
              .single();

            // Create new log
            const { data: newLog } = await supabaseClient
              .from('call_logs')
              .insert({
                org_id: settings.org_id,
                exotel_call_sid: call.Sid,
                exotel_conversation_uuid: call.ConversationUuid,
                call_type: call.Direction?.includes('incoming') ? 'inbound' : 'outbound',
                from_number: call.From,
                to_number: call.To,
                direction: call.Direction,
                ...buildCallLogUpdate(call),
                contact_id: contact?.id,
              })
              .select('id')
              .single();

            // Create activity for terminal calls with contact
            if (isTerminal && contact?.id && newLog) {
              const created = await createCallActivity(supabaseClient, {
                orgId: settings.org_id,
                contactId: contact.id,
                callLogId: newLog.id,
                callSid: call.Sid,
                callType: call.Direction?.includes('incoming') ? 'inbound' : 'outbound',
                callStatus,
                conversationDuration: call.ConversationDuration ? parseInt(call.ConversationDuration) : 0,
                endTime: parseExotelTime(call.EndTime),
              });
              if (created) activitiesCreated++;
            }

            // Close stuck sessions
            if (isTerminal) {
              await closeStuckSessions(supabaseClient, call.Sid, parseExotelTime(call.EndTime));
            }
          }
          syncedCount++;
        }

        results.push({
          org_id: settings.org_id,
          status: 'success',
          synced_count: syncedCount,
          activities_created: activitiesCreated
        });
      } catch (error) {
        console.error(`Error syncing calls for org ${settings.org_id}:`, error);
        results.push({ org_id: settings.org_id, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return jsonResponse({ success: true, results });
  } catch (error) {
    console.error('Error in exotel-sync-call-logs:', error);
    return errorResponse(error);
  }
});
