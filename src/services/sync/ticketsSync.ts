// Support tickets + ticket_comments offline sync.

import { db, type SupportTicketLocal, type TicketCommentLocal } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/services/logger";
import { syncAnalytics } from "@/services/syncAnalytics";
import { registerEntitySync } from "@/services/syncProcessor";

interface ServerTicketRow {
  id: string;
  org_id: string;
  created_by: string;
  assigned_to: string | null;
  ticket_number: string;
  subject: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  company_name: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

interface ServerCommentRow {
  id: string;
  ticket_id: string;
  org_id: string;
  user_id: string;
  comment: string;
  is_internal: boolean;
  created_at: string;
}

export function serverTicketToLocal(row: ServerTicketRow): SupportTicketLocal {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by,
    assignedTo: row.assigned_to,
    ticketNumber: row.ticket_number,
    subject: row.subject,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    companyName: row.company_name,
    source: row.source,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    serverUpdatedAt: new Date(row.updated_at),
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  };
}

export function serverCommentToLocal(row: ServerCommentRow): TicketCommentLocal {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    orgId: row.org_id,
    userId: row.user_id,
    comment: row.comment,
    isInternal: row.is_internal,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.created_at),
    syncStatus: "synced",
    lastSyncedAt: new Date(),
    serverUpdatedAt: new Date(row.created_at),
  };
}

async function syncPendingTickets(): Promise<void> {
  const items = await db.syncQueue.where("type").equals("ticket").toArray();
  if (items.length === 0) return;

  for (const item of items) {
    if (item.retryCount >= item.maxRetries) continue;

    const start = Date.now();
    try {
      if (item.action === "delete") {
        const data = item.data as { id?: string };
        if (data?.id) {
          // Delete cascades on server (or leave orphan rows for manual cleanup
          // — best-effort here: just delete the parent).
          const { error } = await supabase
            .from("support_tickets")
            .delete()
            .eq("id", data.id);
          if (error) throw error;
        }
        await db.syncQueue.delete(item.id);
        syncAnalytics.record({
          type: "ticket",
          entityId: item.entityId,
          status: "success",
          durationMs: Date.now() - start,
        });
        continue;
      }

      const local = await db.tickets.get(item.entityId);
      if (!local) {
        await db.syncQueue.delete(item.id);
        continue;
      }

      if (item.action === "create") {
        const insertPayload = {
          org_id: local.orgId,
          created_by: local.createdBy,
          assigned_to: local.assignedTo,
          subject: local.subject,
          description: local.description,
          category: local.category,
          priority: local.priority,
          status: local.status,
          contact_name: local.contactName,
          contact_phone: local.contactPhone,
          contact_email: local.contactEmail,
          company_name: local.companyName,
          source: local.source,
          ticket_number: "TEMP",
        };
        const { data, error } = await supabase
          .from("support_tickets")
          .insert(insertPayload)
          .select()
          .single();
        if (error) throw error;
        const server = data as unknown as ServerTicketRow;
        await db.tickets.delete(local.id);
        await db.tickets.put(serverTicketToLocal(server));
      } else if (item.action === "update") {
        const updatePayload = {
          assigned_to: local.assignedTo,
          subject: local.subject,
          description: local.description,
          category: local.category,
          priority: local.priority,
          status: local.status,
          contact_name: local.contactName,
          contact_phone: local.contactPhone,
          contact_email: local.contactEmail,
          company_name: local.companyName,
        };
        const { data, error } = await supabase
          .from("support_tickets")
          .update(updatePayload)
          .eq("id", local.id)
          .select()
          .single();
        if (error) throw error;
        const server = data as unknown as ServerTicketRow;
        await db.tickets.update(local.id, {
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          serverUpdatedAt: new Date(server.updated_at),
        });
      }

      await db.syncQueue.delete(item.id);
      syncAnalytics.record({
        type: "ticket",
        entityId: item.entityId,
        status: "success",
        durationMs: Date.now() - start,
        retryCount: item.retryCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Ticket sync failed", "TicketsSync", { id: item.id, error: msg });
      const next = (item.retryCount ?? 0) + 1;
      await db.syncQueue.update(item.id, {
        retryCount: next,
        lastAttemptAt: new Date(),
        error: msg,
      });
      if (next >= item.maxRetries) {
        await db.tickets.update(item.entityId, { syncStatus: "failed" });
      }
      syncAnalytics.record({
        type: "ticket",
        entityId: item.entityId,
        status: "failed",
        durationMs: Date.now() - start,
        retryCount: next,
        error: msg,
      });
    }
  }
}

async function syncPendingTicketComments(): Promise<void> {
  const items = await db.syncQueue
    .where("type")
    .equals("ticket_comment")
    .toArray();
  if (items.length === 0) return;

  for (const item of items) {
    if (item.retryCount >= item.maxRetries) continue;

    const start = Date.now();
    try {
      const local = await db.ticketComments.get(item.entityId);
      if (!local) {
        await db.syncQueue.delete(item.id);
        continue;
      }
      // Don't sync if the parent ticket is still local-only.
      if (local.ticketId.startsWith("local_")) {
        // Wait for the parent ticket to sync first; bump retryCount slightly.
        await db.syncQueue.update(item.id, {
          retryCount: item.retryCount + 1,
          lastAttemptAt: new Date(),
          error: "Parent ticket not yet synced",
        });
        continue;
      }
      if (item.action === "create") {
        const { data, error } = await supabase
          .from("support_ticket_comments")
          .insert({
            ticket_id: local.ticketId,
            org_id: local.orgId,
            user_id: local.userId,
            comment: local.comment,
            is_internal: local.isInternal,
          })
          .select()
          .single();
        if (error) throw error;
        const server = data as unknown as ServerCommentRow;
        await db.ticketComments.delete(local.id);
        await db.ticketComments.put(serverCommentToLocal(server));
      }
      await db.syncQueue.delete(item.id);
      syncAnalytics.record({
        type: "ticket_comment",
        entityId: item.entityId,
        status: "success",
        durationMs: Date.now() - start,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Ticket comment sync failed", "TicketsSync", { id: item.id, error: msg });
      const next = (item.retryCount ?? 0) + 1;
      await db.syncQueue.update(item.id, {
        retryCount: next,
        lastAttemptAt: new Date(),
        error: msg,
      });
      if (next >= item.maxRetries) {
        await db.ticketComments.update(item.entityId, { syncStatus: "failed" });
      }
      syncAnalytics.record({
        type: "ticket_comment",
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
export function registerTicketsSync(): void {
  if (registered) return;
  registered = true;
  registerEntitySync("ticket", syncPendingTickets);
  registerEntitySync("ticket_comment", syncPendingTicketComments);
}

export async function mirrorTicketsToDexie(rows: ServerTicketRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const ids = rows.map((r) => r.id);
    const localRows = await db.tickets.bulkGet(ids);
    const localById = new Map(
      localRows.filter((r): r is SupportTicketLocal => !!r).map((r) => [r.id, r])
    );
    const updates = rows
      .filter((r) => {
        const local = localById.get(r.id);
        return !local || local.syncStatus === "synced";
      })
      .map((r) => serverTicketToLocal(r));
    if (updates.length > 0) await db.tickets.bulkPut(updates);
  } catch (err) {
    console.warn("[Tickets] mirror to Dexie failed", err);
  }
}

export async function mirrorTicketCommentsToDexie(
  rows: ServerCommentRow[]
): Promise<void> {
  if (rows.length === 0) return;
  try {
    const ids = rows.map((r) => r.id);
    const localRows = await db.ticketComments.bulkGet(ids);
    const localById = new Map(
      localRows.filter((r): r is TicketCommentLocal => !!r).map((r) => [r.id, r])
    );
    const updates = rows
      .filter((r) => {
        const local = localById.get(r.id);
        return !local || local.syncStatus === "synced";
      })
      .map((r) => serverCommentToLocal(r));
    if (updates.length > 0) await db.ticketComments.bulkPut(updates);
  } catch (err) {
    console.warn("[TicketComments] mirror to Dexie failed", err);
  }
}
