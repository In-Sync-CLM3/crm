// Task entity sync — registers with the central sync processor and handles
// queue items of type 'task'. Mirrors field-sync's per-entity processor.

import { db, type TaskLocal } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/services/logger";
import { syncAnalytics } from "@/services/syncAnalytics";
import { registerEntitySync } from "@/services/syncProcessor";

interface ServerTaskRow {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  due_date: string;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "medium" | "high" | null;
  completed_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export function serverTaskToLocal(row: ServerTaskRow): TaskLocal {
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    description: row.description,
    assignedTo: row.assigned_to,
    assignedBy: row.assigned_by,
    dueDate: row.due_date,
    status: row.status,
    priority: row.priority,
    completedAt: row.completed_at,
    remarks: row.remarks,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    serverUpdatedAt: new Date(row.updated_at),
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  };
}

export function localTaskToServerInsert(t: TaskLocal): Record<string, unknown> {
  return {
    id: t.id,
    org_id: t.orgId,
    title: t.title,
    description: t.description,
    assigned_to: t.assignedTo,
    assigned_by: t.assignedBy,
    due_date: t.dueDate,
    status: t.status,
    priority: t.priority,
    completed_at: t.completedAt,
    remarks: t.remarks,
  };
}

export function localTaskToServerUpdate(t: TaskLocal): Record<string, unknown> {
  return {
    title: t.title,
    description: t.description,
    assigned_to: t.assignedTo,
    due_date: t.dueDate,
    status: t.status,
    priority: t.priority,
    completed_at: t.completedAt,
    remarks: t.remarks,
  };
}

async function syncPendingTasks(): Promise<void> {
  const items = await db.syncQueue.where("type").equals("task").toArray();
  if (items.length === 0) return;

  for (const item of items) {
    if (item.retryCount >= item.maxRetries) continue;

    const start = Date.now();
    try {
      if (item.action === "delete") {
        // Server side: delete by id (frozen in `data`).
        const data = item.data as { id?: string };
        if (data?.id) {
          const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", data.id);
          if (error) throw error;
        }
        await db.syncQueue.delete(item.id);
        syncAnalytics.record({
          type: "task",
          entityId: item.entityId,
          status: "success",
          durationMs: Date.now() - start,
        });
        continue;
      }

      const local = await db.tasks.get(item.entityId);
      if (!local) {
        await db.syncQueue.delete(item.id);
        continue;
      }

      if (item.action === "create") {
        const { data, error } = await supabase
          .from("tasks")
          .insert(localTaskToServerInsert(local))
          .select()
          .single();
        if (error) throw error;
        await db.tasks.update(local.id, {
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          serverUpdatedAt: data ? new Date((data as ServerTaskRow).updated_at) : new Date(),
        });
      } else if (item.action === "update") {
        const { data, error } = await supabase
          .from("tasks")
          .update(localTaskToServerUpdate(local))
          .eq("id", local.id)
          .select()
          .single();
        if (error) throw error;
        await db.tasks.update(local.id, {
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          serverUpdatedAt: data ? new Date((data as ServerTaskRow).updated_at) : new Date(),
        });
      }

      await db.syncQueue.delete(item.id);
      syncAnalytics.record({
        type: "task",
        entityId: item.entityId,
        status: "success",
        durationMs: Date.now() - start,
        retryCount: item.retryCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Task sync failed", "TasksSync", { id: item.id, error: msg });
      await db.syncQueue.update(item.id, {
        retryCount: item.retryCount + 1,
        lastAttemptAt: new Date(),
        error: msg,
      });
      // Mark the task itself as failed once we've exhausted retries.
      const next = (item.retryCount ?? 0) + 1;
      if (next >= item.maxRetries) {
        await db.tasks.update(item.entityId, { syncStatus: "failed" });
      }
      syncAnalytics.record({
        type: "task",
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
export function registerTasksSync(): void {
  if (registered) return;
  registered = true;
  registerEntitySync("task", syncPendingTasks);
}
