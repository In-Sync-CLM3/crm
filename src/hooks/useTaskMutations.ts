import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "./useNotification";
import { useOrgContext } from "./useOrgContext";
import { db, generateLocalId, type TaskLocal } from "@/lib/db";
import {
  registerTasksSync,
  localTaskToServerInsert,
  localTaskToServerUpdate,
  serverTaskToLocal,
} from "@/services/sync/tasksSync";

registerTasksSync();

const isOnline = () => (typeof navigator !== "undefined" ? navigator.onLine : true);

async function enqueue(
  entityId: string,
  action: "create" | "update" | "delete",
  data: unknown
) {
  await db.syncQueue.put({
    id: `task_${action}_${entityId}`,
    type: "task",
    entityId,
    action,
    data,
    priority: 1,
    retryCount: 0,
    maxRetries: 5,
    createdAt: new Date(),
  });
}

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

export function useTaskMutations() {
  const notify = useNotification();
  const queryClient = useQueryClient();
  const { effectiveOrgId } = useOrgContext();

  const createTask = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      assigned_to: string;
      due_date: string;
      priority?: "low" | "medium" | "high";
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (!effectiveOrgId) throw new Error("No organization context");

      const localId = generateLocalId();
      const now = new Date();
      const local: TaskLocal = {
        id: localId,
        orgId: effectiveOrgId,
        title: data.title,
        description: data.description ?? null,
        assignedTo: data.assigned_to,
        assignedBy: user.id,
        dueDate: data.due_date,
        status: "pending",
        priority: data.priority ?? "medium",
        completedAt: null,
        remarks: null,
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
      };

      await db.tasks.put(local);
      await enqueue(localId, "create", local);

      if (isOnline()) {
        try {
          const { data: row, error } = await supabase
            .from("tasks")
            .insert(localTaskToServerInsert(local))
            .select()
            .single();
          if (!error && row) {
            const serverRow = row as unknown as ServerTaskRow;
            await db.tasks.delete(localId);
            await db.tasks.put(serverTaskToLocal(serverRow));
            await db.syncQueue.delete(`task_create_${localId}`);
          }
        } catch (err) {
          console.log("[Tasks] Will create later:", err);
        }
      }
    },
    onSuccess: () => {
      notify.success(
        isOnline() ? "Task created successfully" : "Task saved offline (will sync)"
      );
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      notify.error("Failed to create task", error);
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        title: string;
        description: string;
        remarks: string;
        assigned_to: string;
        due_date: string;
        priority: "low" | "medium" | "high";
        status: "pending" | "in_progress" | "completed";
      }>;
    }) => {
      const existing = await db.tasks.get(id);
      const now = new Date();
      const updates: Partial<TaskLocal> = {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.remarks !== undefined && { remarks: data.remarks }),
        ...(data.assigned_to !== undefined && { assignedTo: data.assigned_to }),
        ...(data.due_date !== undefined && { dueDate: data.due_date }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.status === "completed" && {
          completedAt: now.toISOString(),
        }),
        syncStatus: "pending",
        updatedAt: now,
      };

      if (existing) {
        await db.tasks.update(id, updates);
      }
      await enqueue(id, "update", { id, ...data });

      if (isOnline()) {
        try {
          // Build server payload from updates so we don't depend on read-back.
          const serverPatch = localTaskToServerUpdate({
            ...(existing ?? ({ id } as TaskLocal)),
            ...updates,
          } as TaskLocal);
          const { error } = await supabase
            .from("tasks")
            .update(serverPatch)
            .eq("id", id);
          if (!error) {
            await db.tasks.update(id, {
              syncStatus: "synced",
              lastSyncedAt: new Date(),
            });
            await db.syncQueue.delete(`task_update_${id}`);
          }
        } catch (err) {
          console.log("[Tasks] Will update later:", err);
        }
      }
    },
    onSuccess: () => {
      notify.success(
        isOnline() ? "Task updated successfully" : "Task updated offline (will sync)"
      );
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      notify.error("Failed to update task", error);
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      await db.tasks.delete(id);
      await enqueue(id, "delete", { id });

      if (isOnline()) {
        try {
          const { error } = await supabase.from("tasks").delete().eq("id", id);
          if (!error) {
            await db.syncQueue.delete(`task_delete_${id}`);
          }
        } catch (err) {
          console.log("[Tasks] Will delete later:", err);
        }
      }
    },
    onSuccess: () => {
      notify.success(
        isOnline() ? "Task deleted successfully" : "Task deleted offline (will sync)"
      );
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      notify.error("Failed to delete task", error);
    },
  });

  const markInProgress = useMutation({
    mutationFn: async (id: string) => {
      const now = new Date();
      await db.tasks.update(id, {
        status: "in_progress",
        syncStatus: "pending",
        updatedAt: now,
      });
      await enqueue(id, "update", { id, status: "in_progress" });

      if (isOnline()) {
        try {
          const { error } = await supabase
            .from("tasks")
            .update({ status: "in_progress" })
            .eq("id", id);
          if (!error) {
            await db.tasks.update(id, {
              syncStatus: "synced",
              lastSyncedAt: new Date(),
            });
            await db.syncQueue.delete(`task_update_${id}`);
          }
        } catch (err) {
          console.log("[Tasks] Will mark-in-progress later:", err);
        }
      }
    },
    onSuccess: () => {
      notify.success(
        isOnline()
          ? "Task marked as in progress"
          : "Marked in progress offline (will sync)"
      );
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      notify.error("Failed to update task status", error);
    },
  });

  const markComplete = useMutation({
    mutationFn: async (id: string) => {
      const now = new Date();
      await db.tasks.update(id, {
        status: "completed",
        completedAt: now.toISOString(),
        syncStatus: "pending",
        updatedAt: now,
      });
      await enqueue(id, "update", { id, status: "completed" });

      if (isOnline()) {
        try {
          const { error } = await supabase
            .from("tasks")
            .update({ status: "completed" })
            .eq("id", id);
          if (!error) {
            await db.tasks.update(id, {
              syncStatus: "synced",
              lastSyncedAt: new Date(),
            });
            await db.syncQueue.delete(`task_update_${id}`);
          }
        } catch (err) {
          console.log("[Tasks] Will mark-complete later:", err);
        }
      }
    },
    onSuccess: () => {
      notify.success(
        isOnline()
          ? "Task marked as complete"
          : "Marked complete offline (will sync)"
      );
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      notify.error("Failed to complete task", error);
    },
  });

  return {
    createTask: createTask.mutate,
    updateTask: updateTask.mutate,
    deleteTask: deleteTask.mutate,
    markInProgress: markInProgress.mutate,
    markComplete: markComplete.mutate,
    isLoading:
      createTask.isPending ||
      updateTask.isPending ||
      deleteTask.isPending ||
      markInProgress.isPending ||
      markComplete.isPending,
  };
}
