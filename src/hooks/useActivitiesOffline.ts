// Offline-aware activity (contact_activities) mutations.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "./useNotification";
import { useOrgContext } from "./useOrgContext";
import { db, generateLocalId, type ActivityLocal } from "@/lib/db";
import {
  registerActivitiesSync,
  serverActivityToLocal,
  localActivityToServer,
} from "@/services/sync/activitiesSync";

registerActivitiesSync();

const isOnline = () => (typeof navigator !== "undefined" ? navigator.onLine : true);

async function enqueue(
  entityId: string,
  action: "create" | "update" | "delete",
  data: unknown
) {
  await db.syncQueue.put({
    id: `activity_${action}_${entityId}`,
    type: "activity",
    entityId,
    action,
    data,
    priority: 1,
    retryCount: 0,
    maxRetries: 5,
    createdAt: new Date(),
  });
}

export interface CreateActivityInput {
  contact_id: string | null;
  activity_type: string;
  subject?: string | null;
  description?: string | null;
  scheduled_at?: string | null;
  completed_at?: string | null;
  duration_minutes?: number | null;
  meeting_link?: string | null;
  next_action_date?: string | null;
  next_action_notes?: string | null;
  priority?: string | null;
}

export type UpdateActivityInput = Partial<CreateActivityInput>;

export function useActivityMutations() {
  const notify = useNotification();
  const queryClient = useQueryClient();
  const { effectiveOrgId } = useOrgContext();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["calendar-activities"] });
    queryClient.invalidateQueries({ queryKey: ["contact-activities"] });
    queryClient.invalidateQueries({ queryKey: ["activities"] });
  };

  const createActivity = useMutation({
    mutationFn: async (input: CreateActivityInput) => {
      if (!effectiveOrgId) throw new Error("No organization context");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const localId = generateLocalId();
      const now = new Date();
      const local: ActivityLocal = {
        id: localId,
        orgId: effectiveOrgId,
        contactId: input.contact_id,
        activityType: input.activity_type,
        subject: input.subject ?? null,
        description: input.description ?? null,
        scheduledAt: input.scheduled_at ?? null,
        completedAt: input.completed_at ?? null,
        durationMinutes: input.duration_minutes ?? null,
        meetingLink: input.meeting_link ?? null,
        nextActionDate: input.next_action_date ?? null,
        nextActionNotes: input.next_action_notes ?? null,
        priority: input.priority ?? null,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
      };
      await db.activities.put(local);
      await enqueue(localId, "create", local);

      let serverId: string | null = null;
      if (isOnline()) {
        try {
          const insertPayload = { ...localActivityToServer(local) };
          delete (insertPayload as Record<string, unknown>).id;
          const { data, error } = await supabase
            .from("contact_activities")
            .insert(insertPayload)
            .select()
            .single();
          if (!error && data) {
            const server = data as { id: string; updated_at: string };
            serverId = server.id;
            await db.activities.delete(localId);
            await db.activities.put(
              serverActivityToLocal({
                ...local,
                id: server.id,
                org_id: effectiveOrgId,
                contact_id: local.contactId,
                activity_type: local.activityType,
                subject: local.subject,
                description: local.description,
                scheduled_at: local.scheduledAt,
                completed_at: local.completedAt,
                duration_minutes: local.durationMinutes,
                meeting_link: local.meetingLink,
                next_action_date: local.nextActionDate,
                next_action_notes: local.nextActionNotes,
                priority: local.priority,
                created_by: local.createdBy,
                created_at: local.createdAt.toISOString(),
                updated_at: server.updated_at,
              })
            );
            await db.syncQueue.delete(`activity_create_${localId}`);
          }
        } catch (err) {
          console.log("[Activities] Will create later:", err);
        }
      }

      return { id: serverId ?? localId, localId };
    },
    onSuccess: () => {
      notify.success(
        isOnline() ? "Activity logged" : "Activity saved offline (will sync)"
      );
      invalidate();
    },
    onError: (error) => {
      notify.error("Failed to save activity", error);
    },
  });

  const updateActivity = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateActivityInput }) => {
      const existing = await db.activities.get(id);
      const now = new Date();
      const updates: Partial<ActivityLocal> = {
        ...(data.contact_id !== undefined && { contactId: data.contact_id }),
        ...(data.activity_type !== undefined && { activityType: data.activity_type }),
        ...(data.subject !== undefined && { subject: data.subject }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.scheduled_at !== undefined && { scheduledAt: data.scheduled_at }),
        ...(data.completed_at !== undefined && { completedAt: data.completed_at }),
        ...(data.duration_minutes !== undefined && { durationMinutes: data.duration_minutes }),
        ...(data.meeting_link !== undefined && { meetingLink: data.meeting_link }),
        ...(data.next_action_date !== undefined && {
          nextActionDate: data.next_action_date,
        }),
        ...(data.next_action_notes !== undefined && {
          nextActionNotes: data.next_action_notes,
        }),
        ...(data.priority !== undefined && { priority: data.priority }),
        syncStatus: "pending",
        updatedAt: now,
      };
      if (existing) await db.activities.update(id, updates);
      await enqueue(id, "update", { id, ...data });

      if (isOnline()) {
        try {
          const serverPatch: Record<string, unknown> = {};
          if (data.contact_id !== undefined) serverPatch.contact_id = data.contact_id;
          if (data.activity_type !== undefined)
            serverPatch.activity_type = data.activity_type;
          if (data.subject !== undefined) serverPatch.subject = data.subject;
          if (data.description !== undefined) serverPatch.description = data.description;
          if (data.scheduled_at !== undefined)
            serverPatch.scheduled_at = data.scheduled_at;
          if (data.completed_at !== undefined)
            serverPatch.completed_at = data.completed_at;
          if (data.duration_minutes !== undefined)
            serverPatch.duration_minutes = data.duration_minutes;
          if (data.meeting_link !== undefined)
            serverPatch.meeting_link = data.meeting_link;
          if (data.next_action_date !== undefined)
            serverPatch.next_action_date = data.next_action_date;
          if (data.next_action_notes !== undefined)
            serverPatch.next_action_notes = data.next_action_notes;
          if (data.priority !== undefined) serverPatch.priority = data.priority;

          const { error } = await supabase
            .from("contact_activities")
            .update(serverPatch)
            .eq("id", id);
          if (!error) {
            await db.activities.update(id, {
              syncStatus: "synced",
              lastSyncedAt: new Date(),
            });
            await db.syncQueue.delete(`activity_update_${id}`);
          }
        } catch (err) {
          console.log("[Activities] Will update later:", err);
        }
      }
    },
    onSuccess: () => {
      notify.success(
        isOnline() ? "Activity updated" : "Activity updated offline (will sync)"
      );
      invalidate();
    },
    onError: (error) => {
      notify.error("Failed to update activity", error);
    },
  });

  const deleteActivity = useMutation({
    mutationFn: async (id: string) => {
      await db.activities.delete(id);
      await enqueue(id, "delete", { id });

      if (isOnline()) {
        try {
          const { error } = await supabase
            .from("contact_activities")
            .delete()
            .eq("id", id);
          if (!error) {
            await db.syncQueue.delete(`activity_delete_${id}`);
          }
        } catch (err) {
          console.log("[Activities] Will delete later:", err);
        }
      }
    },
    onSuccess: () => {
      notify.success(
        isOnline() ? "Activity deleted" : "Activity deleted offline (will sync)"
      );
      invalidate();
    },
    onError: (error) => {
      notify.error("Failed to delete activity", error);
    },
  });

  return {
    createActivity,
    updateActivity,
    deleteActivity,
    isLoading:
      createActivity.isPending ||
      updateActivity.isPending ||
      deleteActivity.isPending,
  };
}
