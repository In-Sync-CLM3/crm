import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { supabase } from "@/integrations/supabase/client";
import { useOrgContext } from "./useOrgContext";
import { TaskWithUsers } from "@/types/tasks";
import { db, type TaskLocal } from "@/lib/db";
import { serverTaskToLocal } from "@/services/sync/tasksSync";
import { registerTasksSync } from "@/services/sync/tasksSync";

interface UseTasksOptions {
  filter?: "all" | "assigned_to_me" | "assigned_by_me";
  status?: "pending" | "in_progress" | "completed";
  limit?: number;
  offset?: number;
}

// Ensure entity sync is registered as soon as anyone uses tasks.
registerTasksSync();

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

interface ServerTaskWithJoins extends ServerTaskRow {
  assignee?: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  creator?: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
}

function decorate(row: ServerTaskWithJoins) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(row.due_date);
  dueDate.setHours(0, 0, 0, 0);
  return {
    ...row,
    isOverdue: dueDate < today && row.status !== "completed",
    dueInDays: Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    ),
  };
}

function localToTaskWithUsers(t: TaskLocal): TaskWithUsers & {
  isOverdue: boolean;
  dueInDays: number;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(t.dueDate);
  dueDate.setHours(0, 0, 0, 0);
  return {
    id: t.id,
    org_id: t.orgId ?? "",
    title: t.title,
    description: t.description ?? null,
    assigned_to: t.assignedTo,
    assigned_by: t.assignedBy,
    due_date: t.dueDate,
    status: t.status,
    priority: t.priority ?? null,
    completed_at: t.completedAt ?? null,
    remarks: t.remarks ?? null,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
    assignee: null,
    creator: null,
    isOverdue: dueDate < today && t.status !== "completed",
    dueInDays: Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    ),
  } as unknown as TaskWithUsers & { isOverdue: boolean; dueInDays: number };
}

export function useTasks(options: UseTasksOptions = {}) {
  const { effectiveOrgId } = useOrgContext();
  const { filter = "all", status, limit, offset = 0 } = options;

  // Server fetch (online path) — populates Dexie as a side effect for offline.
  const serverQuery = useQuery({
    queryKey: ["tasks", effectiveOrgId, filter, status, limit, offset],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error("No organization context");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let query = supabase
        .from("tasks")
        .select(
          `*, assignee:assigned_to(id, first_name, last_name, email), creator:assigned_by(id, first_name, last_name, email)`
        )
        .eq("org_id", effectiveOrgId);

      if (filter === "assigned_to_me") query = query.eq("assigned_to", user.id);
      else if (filter === "assigned_by_me") query = query.eq("assigned_by", user.id);
      if (status) query = query.eq("status", status);

      const countQuery = supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("org_id", effectiveOrgId);
      if (filter === "assigned_to_me") countQuery.eq("assigned_to", user.id);
      else if (filter === "assigned_by_me") countQuery.eq("assigned_by", user.id);
      if (status) countQuery.eq("status", status);
      const { count } = await countQuery;

      query = query.order("due_date", { ascending: true });
      if (limit) query = query.limit(limit);
      if (offset) query = query.range(offset, offset + (limit || 10) - 1);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as unknown as ServerTaskWithJoins[];

      // Mirror to Dexie. Only overwrite local rows that are already 'synced',
      // to preserve un-synced local edits.
      try {
        const localRows = await db.tasks
          .where("orgId")
          .equals(effectiveOrgId)
          .toArray();
        const localById = new Map(localRows.map((r) => [r.id, r]));
        await db.tasks.bulkPut(
          rows
            .filter((r) => {
              const local = localById.get(r.id);
              return !local || local.syncStatus === "synced";
            })
            .map((r) => serverTaskToLocal(r))
        );
      } catch (err) {
        console.warn("[Tasks] mirror to Dexie failed", err);
      }

      const tasks = rows.map(decorate);
      return {
        tasks: tasks as (TaskWithUsers & {
          isOverdue: boolean;
          dueInDays: number;
        })[],
        totalCount: count ?? 0,
      };
    },
    enabled: !!effectiveOrgId,
    retry: 0,
  });

  // Live local read — the offline fallback. Populated by the server query
  // mirror above and by mutations writing to Dexie.
  const localData = useLiveQuery(
    async () => {
      if (!effectiveOrgId) return null;

      let coll = db.tasks.where("orgId").equals(effectiveOrgId);
      let arr = await coll.toArray();

      // The user filter requires the current user id; keep it cheap by reading
      // from supabase auth lazily.
      if (filter === "assigned_to_me" || filter === "assigned_by_me") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          if (filter === "assigned_to_me")
            arr = arr.filter((r) => r.assignedTo === user.id);
          else if (filter === "assigned_by_me")
            arr = arr.filter((r) => r.assignedBy === user.id);
        }
      }
      if (status) arr = arr.filter((r) => r.status === status);

      arr.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const total = arr.length;
      const page = arr.slice(offset, offset + (limit ?? arr.length));
      return {
        tasks: page.map(localToTaskWithUsers),
        totalCount: total,
      };
    },
    [effectiveOrgId, filter, status, limit, offset]
  );

  // Prefer server data once it arrives (joined names); fall back to Dexie.
  const data = serverQuery.data ?? localData ?? undefined;
  const isLoading = serverQuery.isLoading && !localData;

  return {
    data,
    isLoading,
  };
}
