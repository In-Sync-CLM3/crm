import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseClient } from '../_shared/supabaseClient.ts';
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

    // Find calls stuck in non-terminal states for more than 10 minutes
    const staleThreshold = new Date();
    staleThreshold.setMinutes(staleThreshold.getMinutes() - 10);

    const { data: staleCalls, error: staleError } = await supabaseClient
      .from('call_logs')
      .select('*')
      .in('status', ['in-progress', 'ringing', 'initiating', 'queued'])
      .lt('created_at', staleThreshold.toISOString())
      .is('activity_id', null);

    if (staleError) throw staleError;

    if (!staleCalls || staleCalls.length === 0) {
      return jsonResponse({ message: 'No stale calls found', synced: 0 });
    }

    console.log(`Found ${staleCalls.length} stale calls to sync`);

    // Get unique org settings
    const orgSettings = new Map();
    for (const call of staleCalls) {
      if (!orgSettings.has(call.org_id)) {
        const { data: settings } = await supabaseClient
          .from('exotel_settings')
          .select('*')
          .eq('org_id', call.org_id)
          .eq('is_active', true)
          .single();

        if (settings) orgSettings.set(call.org_id, settings);
      }
    }

    let syncedCount = 0;
    let activitiesCreated = 0;

    for (const callLog of staleCalls) {
      const settings = orgSettings.get(callLog.org_id);
      if (!settings) {
        console.log(`No active Exotel settings for org ${callLog.org_id}`);
        continue;
      }

      try {
        // Fetch call details from Exotel API
        const exotelUrl = `https://${settings.subdomain}/v1/Accounts/${settings.account_sid}/Calls/${callLog.exotel_call_sid}.json`;
        const auth = btoa(`${settings.api_key}:${settings.api_token}`);

        const response = await fetch(exotelUrl, {
          headers: { 'Authorization': `Basic ${auth}` },
        });

        if (!response.ok) {
          console.error(`Failed to fetch call ${callLog.exotel_call_sid} from Exotel:`, await response.text());
          continue;
        }

        const data = await response.json();
        const call = data.Call;
        if (!call) {
          console.error(`No call data in response for ${callLog.exotel_call_sid}`);
          continue;
        }

        const callStatus = call.Status?.toLowerCase() || 'unknown';
        const isTerminal = isTerminalStatus(callStatus);

        console.log(`Call ${callLog.exotel_call_sid}: Exotel status = ${callStatus}, isTerminal = ${isTerminal}`);

        // Update call log with latest data
        await supabaseClient
          .from('call_logs')
          .update(buildCallLogUpdate(call))
          .eq('id', callLog.id);

        syncedCount++;

        // Create activity for terminal calls
        if (isTerminal && callLog.contact_id && !callLog.activity_id) {
          const created = await createCallActivity(supabaseClient, {
            orgId: callLog.org_id,
            contactId: callLog.contact_id,
            agentId: callLog.agent_id,
            callLogId: callLog.id,
            callSid: callLog.exotel_call_sid,
            callType: callLog.call_type === 'inbound' ? 'inbound' : 'outbound',
            callStatus,
            conversationDuration: call.ConversationDuration ? parseInt(call.ConversationDuration) : 0,
            endTime: parseExotelTime(call.EndTime),
          });
          if (created) activitiesCreated++;
        }

        // Close stuck agent sessions
        if (isTerminal) {
          await closeStuckSessions(supabaseClient, callLog.exotel_call_sid, parseExotelTime(call.EndTime));
        }
      } catch (error) {
        console.error(`Error syncing call ${callLog.exotel_call_sid}:`, error);
      }
    }

    return jsonResponse({
      success: true,
      stale_calls_found: staleCalls.length,
      synced: syncedCount,
      activities_created: activitiesCreated,
    });
  } catch (error) {
    console.error('Error in auto-sync-stale-calls:', error);
    return errorResponse(error);
  }
});
