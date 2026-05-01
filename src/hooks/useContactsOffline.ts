// Offline-aware contact mutations. Uses the same Dexie + sync queue pattern
// as Tasks. Drop-in replacement for inline supabase.from('contacts').insert /
// update / delete blocks in CreateContactDialog, EditContactDialog, etc.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNotification } from "./useNotification";
import { useOrgContext } from "./useOrgContext";
import { db, generateLocalId, type ContactLocal } from "@/lib/db";
import {
  registerContactsSync,
  serverContactToLocal,
  localContactToServer,
} from "@/services/sync/contactsSync";

registerContactsSync();

const isOnline = () => (typeof navigator !== "undefined" ? navigator.onLine : true);

async function enqueue(
  entityId: string,
  action: "create" | "update" | "delete",
  data: unknown
) {
  await db.syncQueue.put({
    id: `contact_${action}_${entityId}`,
    type: "contact",
    entityId,
    action,
    data,
    priority: 1,
    retryCount: 0,
    maxRetries: 5,
    createdAt: new Date(),
  });
}

export interface CreateContactInput {
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  job_title?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  industry_type?: string | null;
  nature_of_business?: string | null;
  status?: string | null;
  source?: string | null;
  linkedin_url?: string | null;
  pipeline_stage_id?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
}

export type UpdateContactInput = Partial<CreateContactInput>;

export function useContactMutations() {
  const notify = useNotification();
  const queryClient = useQueryClient();
  const { effectiveOrgId } = useOrgContext();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
    queryClient.invalidateQueries({ queryKey: ["contact"] });
    queryClient.invalidateQueries({ queryKey: ["pipeline-contacts"] });
  };

  const createContact = useMutation({
    mutationFn: async (input: CreateContactInput) => {
      if (!effectiveOrgId) throw new Error("No organization context");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const localId = generateLocalId();
      const now = new Date();
      const local: ContactLocal = {
        id: localId,
        orgId: effectiveOrgId,
        firstName: input.first_name,
        lastName: input.last_name ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        company: input.company ?? null,
        jobTitle: input.job_title ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country ?? null,
        status: input.status ?? "new",
        source: input.source ?? null,
        pipelineStageId: input.pipeline_stage_id ?? null,
        assignedTo: input.assigned_to ?? null,
        assignedTeamId: null,
        notes: input.notes ?? null,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
      };

      await db.contacts.put(local);
      await enqueue(localId, "create", local);

      let serverId: string | null = null;
      if (isOnline()) {
        try {
          const payload = {
            ...localContactToServer(local),
            // The server has columns we don't model in Dexie. Pass through.
            industry_type: input.industry_type ?? null,
            nature_of_business: input.nature_of_business ?? null,
            linkedin_url: input.linkedin_url ?? null,
          };
          // Don't send the local id — let the server generate uuid.
          delete (payload as Record<string, unknown>).id;
          const { data, error } = await supabase
            .from("contacts")
            .insert(payload)
            .select()
            .single();
          if (!error && data) {
            const server = data as { id: string; updated_at: string };
            serverId = server.id;
            // Replace the local row with one keyed on the server id.
            await db.contacts.delete(localId);
            await db.contacts.put(
              serverContactToLocal({
                ...local,
                id: server.id,
                org_id: effectiveOrgId,
                first_name: local.firstName,
                last_name: local.lastName,
                email: local.email,
                phone: local.phone,
                company: local.company,
                job_title: local.jobTitle,
                status: local.status,
                source: local.source,
                pipeline_stage_id: local.pipelineStageId,
                assigned_to: local.assignedTo,
                assigned_team_id: local.assignedTeamId,
                city: local.city,
                state: local.state,
                country: local.country,
                notes: local.notes,
                created_by: local.createdBy,
                created_at: local.createdAt.toISOString(),
                updated_at: server.updated_at,
              })
            );
            await db.syncQueue.delete(`contact_create_${localId}`);
          }
        } catch (err) {
          console.log("[Contacts] Will create later:", err);
        }
      }

      return { id: serverId ?? localId, localId };
    },
    onSuccess: () => {
      notify.success(
        isOnline()
          ? "Contact created"
          : "Contact saved offline (will sync when online)"
      );
      invalidate();
    },
    onError: (error) => {
      notify.error("Failed to create contact", error);
    },
  });

  const updateContact = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateContactInput;
    }) => {
      const existing = await db.contacts.get(id);
      const now = new Date();
      const updates: Partial<ContactLocal> = {
        ...(data.first_name !== undefined && { firstName: data.first_name }),
        ...(data.last_name !== undefined && { lastName: data.last_name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.company !== undefined && { company: data.company }),
        ...(data.job_title !== undefined && { jobTitle: data.job_title }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.source !== undefined && { source: data.source }),
        ...(data.pipeline_stage_id !== undefined && {
          pipelineStageId: data.pipeline_stage_id,
        }),
        ...(data.assigned_to !== undefined && { assignedTo: data.assigned_to }),
        ...(data.notes !== undefined && { notes: data.notes }),
        syncStatus: "pending",
        updatedAt: now,
      };

      if (existing) await db.contacts.update(id, updates);
      await enqueue(id, "update", { id, ...data });

      if (isOnline()) {
        try {
          const serverPatch: Record<string, unknown> = {};
          if (data.first_name !== undefined) serverPatch.first_name = data.first_name;
          if (data.last_name !== undefined) serverPatch.last_name = data.last_name;
          if (data.email !== undefined) serverPatch.email = data.email;
          if (data.phone !== undefined) serverPatch.phone = data.phone;
          if (data.company !== undefined) serverPatch.company = data.company;
          if (data.job_title !== undefined) serverPatch.job_title = data.job_title;
          if (data.city !== undefined) serverPatch.city = data.city;
          if (data.state !== undefined) serverPatch.state = data.state;
          if (data.country !== undefined) serverPatch.country = data.country;
          if (data.status !== undefined) serverPatch.status = data.status;
          if (data.source !== undefined) serverPatch.source = data.source;
          if (data.pipeline_stage_id !== undefined)
            serverPatch.pipeline_stage_id = data.pipeline_stage_id;
          if (data.assigned_to !== undefined)
            serverPatch.assigned_to = data.assigned_to;
          if (data.notes !== undefined) serverPatch.notes = data.notes;
          if (data.industry_type !== undefined)
            serverPatch.industry_type = data.industry_type;
          if (data.nature_of_business !== undefined)
            serverPatch.nature_of_business = data.nature_of_business;
          if (data.linkedin_url !== undefined)
            serverPatch.linkedin_url = data.linkedin_url;

          const { error } = await supabase
            .from("contacts")
            .update(serverPatch)
            .eq("id", id);
          if (!error) {
            await db.contacts.update(id, {
              syncStatus: "synced",
              lastSyncedAt: new Date(),
            });
            await db.syncQueue.delete(`contact_update_${id}`);
          }
        } catch (err) {
          console.log("[Contacts] Will update later:", err);
        }
      }
    },
    onSuccess: () => {
      notify.success(
        isOnline()
          ? "Contact updated"
          : "Contact updated offline (will sync)"
      );
      invalidate();
    },
    onError: (error) => {
      notify.error("Failed to update contact", error);
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      await db.contacts.delete(id);
      await enqueue(id, "delete", { id });

      if (isOnline()) {
        try {
          const { error } = await supabase.from("contacts").delete().eq("id", id);
          if (!error) {
            await db.syncQueue.delete(`contact_delete_${id}`);
          }
        } catch (err) {
          console.log("[Contacts] Will delete later:", err);
        }
      }
    },
    onSuccess: () => {
      notify.success(
        isOnline() ? "Contact deleted" : "Contact deleted offline (will sync)"
      );
      invalidate();
    },
    onError: (error) => {
      notify.error("Failed to delete contact", error);
    },
  });

  return {
    createContact,
    updateContact,
    deleteContact,
    isLoading:
      createContact.isPending ||
      updateContact.isPending ||
      deleteContact.isPending,
  };
}
