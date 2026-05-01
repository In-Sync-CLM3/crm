// Call log entity sync. Call logs themselves are created server-side by
// Exotel webhooks; the only client-side write is the disposition update
// flow. We mirror reads into Dexie so the CallLogs page works offline.

import { db, type CallLogLocal } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/services/logger";
import { syncAnalytics } from "@/services/syncAnalytics";
import { registerEntitySync } from "@/services/syncProcessor";

interface ServerCallLogRow {
  id: string;
  org_id: string;
  contact_id: string | null;
  agent_id: string | null;
  exotel_call_sid: string;
  call_type: "inbound" | "outbound";
  from_number: string;
  to_number: string;
  direction: string;
  status: string;
  call_duration: number | null;
  started_at: string | null;
  ended_at: string | null;
  disposition_id: string | null;
  sub_disposition_id: string | null;
  notes: string | null;
  activity_id: string | null;
  created_at: string;
}

export function serverCallLogToLocal(row: ServerCallLogRow): CallLogLocal {
  return {
    id: row.id,
    orgId: row.org_id,
    contactId: row.contact_id,
    agentId: row.agent_id,
    exotelCallSid: row.exotel_call_sid,
    callType: row.call_type,
    fromNumber: row.from_number,
    toNumber: row.to_number,
    direction: row.direction,
    status: row.status,
    callDuration: row.call_duration,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    dispositionId: row.disposition_id,
    subDispositionId: row.sub_disposition_id,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.created_at),
    serverUpdatedAt: new Date(row.created_at),
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  };
}

async function syncPendingCallLogs(): Promise<void> {
  const items = await db.syncQueue.where("type").equals("call_log").toArray();
  if (items.length === 0) return;

  for (const item of items) {
    if (item.retryCount >= item.maxRetries) continue;

    const start = Date.now();
    try {
      // Only 'update' is supported; call logs aren't created or deleted client-side.
      if (item.action !== "update") {
        await db.syncQueue.delete(item.id);
        continue;
      }

      const local = await db.callLogs.get(item.entityId);
      if (!local) {
        await db.syncQueue.delete(item.id);
        continue;
      }

      const { error } = await supabase
        .from("call_logs")
        .update({
          disposition_id: local.dispositionId,
          sub_disposition_id: local.subDispositionId,
          notes: local.notes,
        })
        .eq("id", local.id);
      if (error) throw error;

      await db.callLogs.update(local.id, {
        syncStatus: "synced",
        lastSyncedAt: new Date(),
      });
      await db.syncQueue.delete(item.id);
      syncAnalytics.record({
        type: "call_log",
        entityId: item.entityId,
        status: "success",
        durationMs: Date.now() - start,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Call log sync failed", "CallLogsSync", { id: item.id, error: msg });
      const next = (item.retryCount ?? 0) + 1;
      await db.syncQueue.update(item.id, {
        retryCount: next,
        lastAttemptAt: new Date(),
        error: msg,
      });
      if (next >= item.maxRetries) {
        await db.callLogs.update(item.entityId, { syncStatus: "failed" });
      }
      syncAnalytics.record({
        type: "call_log",
        entityId: item.entityId,
        status: "failed",
        durationMs: Date.now() - start,
        retryCount: next,
        error: msg,
      });
    }
  }
}

let registered = false;
export function registerCallLogsSync(): void {
  if (registered) return;
  registered = true;
  registerEntitySync("call_log", syncPendingCallLogs);
}

export async function mirrorCallLogsToDexie(rows: ServerCallLogRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const ids = rows.map((r) => r.id);
    const localRows = await db.callLogs.bulkGet(ids);
    const localById = new Map(
      localRows.filter((r): r is CallLogLocal => !!r).map((r) => [r.id, r])
    );
    const updates = rows
      .filter((r) => {
        const local = localById.get(r.id);
        return !local || local.syncStatus === "synced";
      })
      .map((r) => serverCallLogToLocal(r));
    if (updates.length > 0) await db.callLogs.bulkPut(updates);
  } catch (err) {
    console.warn("[CallLogs] mirror to Dexie failed", err);
  }
}

export async function updateCallLogDispositionOffline(input: {
  callLogId: string;
  dispositionId: string | null;
  subDispositionId: string | null;
  notes: string | null;
}): Promise<void> {
  registerCallLogsSync();
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

  const existing = await db.callLogs.get(input.callLogId);
  const now = new Date();
  if (existing) {
    await db.callLogs.update(input.callLogId, {
      dispositionId: input.dispositionId,
      subDispositionId: input.subDispositionId,
      notes: input.notes,
      syncStatus: "pending",
      updatedAt: now,
    });
  }

  await db.syncQueue.put({
    id: `call_log_update_${input.callLogId}`,
    type: "call_log",
    entityId: input.callLogId,
    action: "update",
    data: input,
    priority: 1,
    retryCount: 0,
    maxRetries: 5,
    createdAt: now,
  });

  if (isOnline) {
    try {
      const { error } = await supabase
        .from("call_logs")
        .update({
          disposition_id: input.dispositionId,
          sub_disposition_id: input.subDispositionId,
          notes: input.notes,
        })
        .eq("id", input.callLogId);
      if (!error) {
        await db.callLogs.update(input.callLogId, {
          syncStatus: "synced",
          lastSyncedAt: new Date(),
        });
        await db.syncQueue.delete(`call_log_update_${input.callLogId}`);
      }
    } catch (err) {
      console.log("[CallLogs] Will update later:", err);
    }
  }
}
