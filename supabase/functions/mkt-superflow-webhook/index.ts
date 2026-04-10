import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { createEngineLogger } from '../_shared/engineLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * mkt-superflow-webhook
 *
 * Receives PSTN-level call events from SuperFlow/Vocallabs.
 * These are separate from Vapi's own webhook events — SuperFlow fires these
 * to report SIP/PSTN outcomes (connected, failed, duration, recording URL).
 *
 * Vapi fires its own end-of-call-report (transcript, insights) independently
 * to mkt-vapi-webhook via the assistant's serverUrl. Both webhooks coexist.
 *
 * Since the exact SuperFlow webhook schema is confirmed only when the account
 * is live, this handler extracts fields defensively and logs everything.
 * The reconcileAction function handles all known meaningful event types.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Always return 200 — webhook providers retry on non-2xx and we never want
  // SuperFlow to back off because of a processing error on our side.
  const logger = createEngineLogger('mkt-superflow-webhook');

  try {
    const supabase = getSupabaseClient();
    const payload = await req.json() as Record<string, unknown>;

    // ---------------------------------------------------------------------------
    // Extract fields defensively — SuperFlow field names confirmed on first live call
    // ---------------------------------------------------------------------------
    const superflowCallId: string | null =
      (payload.call_id as string) ||
      (payload.id as string) ||
      (payload.callId as string) ||
      null;

    // Event type: SuperFlow may use 'event', 'type', or 'status'
    const eventType: string =
      (payload.event as string) ||
      (payload.type as string) ||
      (payload.status as string) ||
      'unknown';

    // Duration in seconds (may be present on call-ended events)
    const durationSeconds: number | null =
      (payload.duration as number) ||
      (payload.duration_seconds as number) ||
      (payload.call_duration as number) ||
      null;

    // Recording URL (if SuperFlow provides one)
    const recordingUrl: string | null =
      (payload.recording_url as string) ||
      (payload.recordingUrl as string) ||
      null;

    // Error/failure reason
    const failureReason: string | null =
      (payload.error as string) ||
      (payload.reason as string) ||
      (payload.failure_reason as string) ||
      null;

    // Log the raw event for debugging (all keys visible in mkt_engine_logs)
    await logger.info('superflow-event-received', {
      event_type: eventType,
      superflow_call_id: superflowCallId,
      duration_seconds: durationSeconds,
      recording_url: recordingUrl,
      failure_reason: failureReason,
      raw_payload_keys: Object.keys(payload),
    });

    // ---------------------------------------------------------------------------
    // Reconcile with action record if we have a superflow_call_id
    // ---------------------------------------------------------------------------
    if (superflowCallId) {
      await reconcileAction(supabase, superflowCallId, eventType, durationSeconds, recordingUrl, failureReason, logger);
    }
  } catch (err) {
    // Log but still return 200 — never let our errors cause webhook retries
    await logger.error(
      'superflow-webhook-error',
      err instanceof Error ? err : new Error(String(err)),
    );
  }

  return new Response(
    JSON.stringify({ received: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

// ---------------------------------------------------------------------------
// Action Reconciliation
// ---------------------------------------------------------------------------

/**
 * Look up the mkt_sequence_actions row whose metadata->>'superflow_call_id'
 * matches, then apply status updates based on the event type.
 *
 * Note: Vapi's end-of-call-report handles transcript/insights. This function
 * only covers PSTN-level outcomes that Vapi wouldn't know about (e.g. SIP
 * call never connected, PSTN error before audio started).
 */
async function reconcileAction(
  supabase: ReturnType<typeof getSupabaseClient>,
  superflowCallId: string,
  eventType: string,
  durationSeconds: number | null,
  recordingUrl: string | null,
  failureReason: string | null,
  logger: ReturnType<typeof createEngineLogger>,
): Promise<void> {
  // Find the action by superflow_call_id stored in JSONB metadata
  const { data: action, error } = await supabase
    .from('mkt_sequence_actions')
    .select('id, status, metadata')
    .filter('metadata->>superflow_call_id', 'eq', superflowCallId)
    .maybeSingle();

  if (error || !action) {
    // Not found — may arrive before action record is written on very fast calls
    await logger.warn('superflow-action-not-found', { superflow_call_id: superflowCallId });
    return;
  }

  const actionId = action.id as string;
  const normalizedEvent = eventType.toLowerCase().replace(/[-_\s]/g, '_');

  // Determine what update to apply based on event type
  // Pattern-match common SuperFlow event names — extend when schema is confirmed
  const isConnected =
    normalizedEvent.includes('connect') ||
    normalizedEvent.includes('answer') ||
    normalizedEvent === 'in_progress';

  const isFailed =
    normalizedEvent.includes('fail') ||
    normalizedEvent.includes('error') ||
    normalizedEvent.includes('busy') ||
    normalizedEvent === 'no_answer' ||
    normalizedEvent === 'rejected';

  const isCompleted =
    normalizedEvent.includes('complet') ||
    normalizedEvent.includes('end') ||
    normalizedEvent.includes('hangup') ||
    normalizedEvent.includes('discon');

  const currentMetadata = (action.metadata as Record<string, unknown>) || {};

  if (isConnected && !action.status?.includes('delivered')) {
    await supabase
      .from('mkt_sequence_actions')
      .update({
        delivered_at: new Date().toISOString(),
        metadata: { ...currentMetadata, superflow_event: eventType },
      })
      .eq('id', actionId);

    await logger.info('superflow-call-connected', { action_id: actionId, superflow_call_id: superflowCallId });

  } else if (isFailed && action.status !== 'failed') {
    await supabase
      .from('mkt_sequence_actions')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        failure_reason: failureReason || `SuperFlow PSTN failure: ${eventType}`,
        metadata: { ...currentMetadata, superflow_event: eventType },
      })
      .eq('id', actionId);

    await logger.warn('superflow-call-failed', {
      action_id: actionId,
      superflow_call_id: superflowCallId,
      event_type: eventType,
      failure_reason: failureReason,
    });

  } else if (isCompleted) {
    // Merge PSTN-level data (duration, recording) into existing metadata.
    // Don't overwrite status — Vapi's end-of-call-report owns the final outcome.
    const updatedMetadata: Record<string, unknown> = {
      ...currentMetadata,
      superflow_event: eventType,
    };
    if (durationSeconds !== null) updatedMetadata.pstn_duration_seconds = durationSeconds;
    if (recordingUrl) updatedMetadata.superflow_recording_url = recordingUrl;

    await supabase
      .from('mkt_sequence_actions')
      .update({ metadata: updatedMetadata })
      .eq('id', actionId);

    await logger.info('superflow-call-completed', {
      action_id: actionId,
      superflow_call_id: superflowCallId,
      duration_seconds: durationSeconds,
      has_recording: !!recordingUrl,
    });
  }
}
