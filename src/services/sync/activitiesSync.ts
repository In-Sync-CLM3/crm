// Activity (contact_activities) entity sync.

import { db, type ActivityLocal } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/services/logger";
import { syncAnalytics } from "@/services/syncAnalytics";
import { registerEntitySync } from "@/services/syncProcessor";

interface ServerActivityRow {
  id: string;
  org_id: string;
  contact_id: string | null;
  activity_type: string;
  subject: string | null;
  description: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  meeting_link: string | null;
  next_action_date: string | null;
  next_action_notes: string | null;
  priority: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function serverActivityToLocal(row: ServerActivityRow): ActivityLocal {
  return {
    id: row.id,
    orgId: row.org_id,
    contactId: row.contact_id,
    activityType: row.activity_type,
    subject: row.subject,
    description: row.description,
    scheduledAt: row.scheduled_at,
    completedAt: row.completed_at,
    durationMinutes: row.duration_minutes,
    meetingLink: row.meeting_link,
    nextActionDate: row.next_action_date,
    nextActionNotes: row.next_action_notes,
    priority: row.priority,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    serverUpdatedAt: new Date(row.updated_at),
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  };
}

export function localActivityToServer(a: ActivityLocal): Record<string, unknown> {
  return {
    id: a.id.startsWith("local_") ? undefined : a.id,
    org_id: a.orgId,
    contact_id: a.contactId,
    activity_type: a.activityType,
    subject: a.subject,
    description: a.description,
    scheduled_at: a.scheduledAt,
    completed_at: a.completedAt,
    duration_minutes: a.durationMinutes,
    meeting_link: a.meetingLink,
    next_action_date: a.nextActionDate,
    next_action_notes: a.nextActionNotes,
    priority: a.priority,
    created_by: a.createdBy,
  };
}

async function syncPendingActivities(): Promise<void> {
  const items = await db.syncQueue.where("type").equals("activity").toArray();
  if (items.length === 0) return;

  for (const item of items) {
    if (item.retryCount >= item.maxRetries) continue;

    const start = Date.now();
    try {
      if (item.action === "delete") {
        const data = item.data as { id?: string };
        if (data?.id) {
          const { error } = await supabase
            .from("contact_activities")
            .delete()
            .eq("id", data.id);
          if (error) throw error;
        }
        await db.syncQueue.delete(item.id);
        syncAnalytics.record({
          type: "activity",
          entityId: item.entityId,
          status: "success",
          durationMs: Date.now() - start,
        });
        continue;
      }

      const local = await db.activities.get(item.entityId);
      if (!local) {
        await db.syncQueue.delete(item.id);
        continue;
      }

      const payload = localActivityToServer(local);

      if (item.action === "create") {
        // Don't send id for offline-generated rows; let server assign uuid.
        const insertPayload = { ...payload };
        delete (insertPayload as Record<string, unknown>).id;
        const { data, error } = await supabase
          .from("contact_activities")
          .insert(insertPayload)
          .select()
          .single();
        if (error) throw error;
        const server = data as unknown as ServerActivityRow;
        await db.activities.delete(local.id);
        await db.activities.put(serverActivityToLocal(server));
      } else if (item.action === "update") {
        const { id: _id, org_id: _org, ...updateFields } = payload;
        const { data, error } = await supabase
          .from("contact_activities")
          .update(updateFields)
          .eq("id", local.id)
          .select()
          .single();
        if (error) throw error;
        const server = data as unknown as ServerActivityRow;
        await db.activities.update(local.id, {
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          serverUpdatedAt: new Date(server.updated_at),
        });
      }

      await db.syncQueue.delete(item.id);
      syncAnalytics.record({
        type: "activity",
        entityId: item.entityId,
        status: "success",
        durationMs: Date.now() - start,
        retryCount: item.retryCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Activity sync failed", "ActivitiesSync", { id: item.id, error: msg });
      const next = (item.retryCount ?? 0) + 1;
      await db.syncQueue.update(item.id, {
        retryCount: next,
        lastAttemptAt: new Date(),
        error: msg,
      });
      if (next >= item.maxRetries) {
        await db.activities.update(item.entityId, { syncStatus: "failed" });
      }
      syncAnalytics.record({
        type: "activity",
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
export function registerActivitiesSync(): void {
  if (registered) return;
  registered = true;
  registerEntitySync("activity", syncPendingActivities);
}

export async function mirrorActivitiesToDexie(rows: ServerActivityRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const ids = rows.map((r) => r.id);
    const localRows = await db.activities.bulkGet(ids);
    const localById = new Map(
      localRows.filter((r): r is ActivityLocal => !!r).map((r) => [r.id, r])
    );
    const updates = rows
      .filter((r) => {
        const local = localById.get(r.id);
        return !local || local.syncStatus === "synced";
      })
      .map((r) => serverActivityToLocal(r));
    if (updates.length > 0) await db.activities.bulkPut(updates);
  } catch (err) {
    console.warn("[Activities] mirror to Dexie failed", err);
  }
}
