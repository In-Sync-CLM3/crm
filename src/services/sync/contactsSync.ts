// Contact entity sync — registers with the central sync processor and handles
// queue items of type 'contact'.

import { db, type ContactLocal } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/services/logger";
import { syncAnalytics } from "@/services/syncAnalytics";
import { registerEntitySync } from "@/services/syncProcessor";

interface ServerContactRow {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  status: string | null;
  source: string | null;
  pipeline_stage_id: string | null;
  assigned_to: string | null;
  assigned_team_id: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function serverContactToLocal(row: ServerContactRow): ContactLocal {
  return {
    id: row.id,
    orgId: row.org_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    jobTitle: row.job_title,
    status: row.status,
    source: row.source,
    pipelineStageId: row.pipeline_stage_id,
    assignedTo: row.assigned_to,
    assignedTeamId: row.assigned_team_id,
    city: row.city,
    state: row.state,
    country: row.country,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    serverUpdatedAt: new Date(row.updated_at),
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  };
}

export function localContactToServer(c: ContactLocal): Record<string, unknown> {
  return {
    id: c.id,
    org_id: c.orgId,
    first_name: c.firstName,
    last_name: c.lastName,
    email: c.email,
    phone: c.phone,
    company: c.company,
    job_title: c.jobTitle,
    status: c.status,
    source: c.source,
    pipeline_stage_id: c.pipelineStageId,
    assigned_to: c.assignedTo,
    assigned_team_id: c.assignedTeamId,
    city: c.city,
    state: c.state,
    country: c.country,
    notes: c.notes,
    created_by: c.createdBy,
  };
}

async function syncPendingContacts(): Promise<void> {
  const items = await db.syncQueue.where("type").equals("contact").toArray();
  if (items.length === 0) return;

  for (const item of items) {
    if (item.retryCount >= item.maxRetries) continue;

    const start = Date.now();
    try {
      if (item.action === "delete") {
        const data = item.data as { id?: string };
        if (data?.id) {
          const { error } = await supabase
            .from("contacts")
            .delete()
            .eq("id", data.id);
          if (error) throw error;
        }
        await db.syncQueue.delete(item.id);
        syncAnalytics.record({
          type: "contact",
          entityId: item.entityId,
          status: "success",
          durationMs: Date.now() - start,
        });
        continue;
      }

      const local = await db.contacts.get(item.entityId);
      if (!local) {
        await db.syncQueue.delete(item.id);
        continue;
      }

      const payload = localContactToServer(local);

      if (item.action === "create") {
        const { data, error } = await supabase
          .from("contacts")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        const server = data as unknown as ServerContactRow;
        await db.contacts.update(local.id, {
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          serverUpdatedAt: new Date(server.updated_at),
        });
      } else if (item.action === "update") {
        const { id: _id, org_id: _org, created_by: _cb, ...updateFields } = payload;
        const { data, error } = await supabase
          .from("contacts")
          .update(updateFields)
          .eq("id", local.id)
          .select()
          .single();
        if (error) throw error;
        const server = data as unknown as ServerContactRow;
        await db.contacts.update(local.id, {
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          serverUpdatedAt: new Date(server.updated_at),
        });
      }

      await db.syncQueue.delete(item.id);
      syncAnalytics.record({
        type: "contact",
        entityId: item.entityId,
        status: "success",
        durationMs: Date.now() - start,
        retryCount: item.retryCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Contact sync failed", "ContactsSync", {
        id: item.id,
        error: msg,
      });
      const next = (item.retryCount ?? 0) + 1;
      await db.syncQueue.update(item.id, {
        retryCount: next,
        lastAttemptAt: new Date(),
        error: msg,
      });
      if (next >= item.maxRetries) {
        await db.contacts.update(item.entityId, { syncStatus: "failed" });
      }
      syncAnalytics.record({
        type: "contact",
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
export function registerContactsSync(): void {
  if (registered) return;
  registered = true;
  registerEntitySync("contact", syncPendingContacts);
}

// Mirror a server fetch into Dexie. Only overwrites local rows whose
// syncStatus is 'synced' so that un-synced local edits are preserved.
export async function mirrorContactsToDexie(rows: ServerContactRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const ids = rows.map((r) => r.id);
    const localRows = await db.contacts.bulkGet(ids);
    const localById = new Map(
      localRows.filter((r): r is ContactLocal => !!r).map((r) => [r.id, r])
    );
    const updates = rows
      .filter((r) => {
        const local = localById.get(r.id);
        return !local || local.syncStatus === "synced";
      })
      .map((r) => serverContactToLocal(r));
    if (updates.length > 0) await db.contacts.bulkPut(updates);
  } catch (err) {
    console.warn("[Contacts] mirror to Dexie failed", err);
  }
}
