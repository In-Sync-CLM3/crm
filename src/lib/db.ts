import Dexie, { Table } from "dexie";

// =============================================================================
// In-Sync CRM offline database
// Mirrors field-sync's Dexie + sync queue pattern.
// Each entity carries syncStatus / lastSyncedAt / updatedAt / serverUpdatedAt.
// Bump DB_VERSION when adding/changing tables or indexes.
// =============================================================================

export type SyncStatus = "synced" | "pending" | "failed" | "draft";

interface OfflineRow {
  id: string;
  orgId?: string;
  syncStatus: SyncStatus;
  lastSyncedAt?: Date;
  updatedAt: Date;
  serverUpdatedAt?: Date;
}

export interface TaskLocal extends OfflineRow {
  title: string;
  description?: string | null;
  assignedTo: string;
  assignedBy: string;
  dueDate: string;
  status: "pending" | "in_progress" | "completed";
  priority?: "low" | "medium" | "high" | null;
  completedAt?: string | null;
  remarks?: string | null;
  createdAt: Date;
}

export interface ContactLocal extends OfflineRow {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  status?: string | null;
  source?: string | null;
  pipelineStageId?: string | null;
  assignedTo?: string | null;
  assignedTeamId?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

export interface ActivityLocal extends OfflineRow {
  contactId?: string | null;
  activityType: string;
  subject?: string | null;
  description?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  durationMinutes?: number | null;
  priority?: string | null;
  meetingLink?: string | null;
  nextActionDate?: string | null;
  nextActionNotes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

export interface CallLogLocal extends OfflineRow {
  contactId?: string | null;
  agentId?: string | null;
  exotelCallSid: string;
  callType: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  direction: string;
  status: string;
  callDuration?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  dispositionId?: string | null;
  subDispositionId?: string | null;
  notes?: string | null;
  createdAt: Date;
}

export interface SupportTicketLocal extends OfflineRow {
  ticketNumber: string;
  subject: string;
  description?: string | null;
  category: string;
  priority: string;
  status: string;
  createdBy: string;
  assignedTo?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  companyName?: string | null;
  source: string;
  createdAt: Date;
}

export interface TicketCommentLocal extends OfflineRow {
  ticketId: string;
  userId: string;
  comment: string;
  isInternal: boolean;
  createdAt: Date;
}

// Generic note attached to any entity (contact note, deal note, ticket note).
// We use the contacts.notes column for contact notes, but we also store free-form
// notes here as a queue when the parent entity is a ticket comment or a contact
// description update.
export interface NoteLocal extends OfflineRow {
  parentType: "contact" | "ticket" | "task";
  parentId: string;
  body: string;
  createdBy?: string | null;
  createdAt: Date;
}

export type SyncEntityType =
  | "task"
  | "contact"
  | "activity"
  | "call_log"
  | "ticket"
  | "ticket_comment"
  | "note";

export interface SyncQueueItem {
  id: string;
  type: SyncEntityType;
  entityId: string;
  action: "create" | "update" | "delete";
  // Frozen snapshot of the payload at queue time. The processor re-reads from
  // the entity table when possible, but `data` is the fallback for delete-style
  // ops where the row is gone.
  data: unknown;
  priority: number; // 1=high, 2=medium, 3=low
  retryCount: number;
  maxRetries: number;
  lastAttemptAt?: Date;
  error?: string;
  createdAt: Date;
}

// IMPORTANT: Bump on every schema/index change.
export const DB_VERSION = 1;

class InSyncCRMDatabase extends Dexie {
  tasks!: Table<TaskLocal, string>;
  contacts!: Table<ContactLocal, string>;
  activities!: Table<ActivityLocal, string>;
  callLogs!: Table<CallLogLocal, string>;
  tickets!: Table<SupportTicketLocal, string>;
  ticketComments!: Table<TicketCommentLocal, string>;
  notes!: Table<NoteLocal, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super("InSyncCRMDB");

    this.version(DB_VERSION).stores({
      tasks: "id, orgId, assignedTo, status, dueDate, syncStatus, updatedAt",
      contacts:
        "id, orgId, assignedTo, pipelineStageId, status, syncStatus, updatedAt",
      activities:
        "id, orgId, contactId, activityType, scheduledAt, syncStatus, updatedAt",
      callLogs:
        "id, orgId, contactId, agentId, exotelCallSid, syncStatus, createdAt",
      tickets:
        "id, orgId, ticketNumber, status, assignedTo, createdBy, syncStatus, updatedAt",
      ticketComments: "id, ticketId, userId, syncStatus, createdAt",
      notes: "id, parentType, parentId, syncStatus, createdAt",
      syncQueue: "id, type, priority, createdAt, retryCount",
    });
  }
}

export const db = new InSyncCRMDatabase();

export async function checkDatabaseVersion(): Promise<{
  current: number;
  expected: number;
  needsUpgrade: boolean;
  status: "ok" | "needs_upgrade" | "newer_than_expected";
}> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("InSyncCRMDB");
    request.onsuccess = () => {
      const currentVersion = request.result.version;
      request.result.close();
      resolve({
        current: currentVersion,
        expected: DB_VERSION,
        needsUpgrade: currentVersion < DB_VERSION,
        status:
          currentVersion < DB_VERSION
            ? "needs_upgrade"
            : currentVersion > DB_VERSION
              ? "newer_than_expected"
              : "ok",
      });
    };
    request.onerror = () => reject(request.error);
  });
}

export async function initializeDatabase(): Promise<void> {
  try {
    await db.open();
    console.log("[DB] Opened at version:", db.verno);
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    console.error("[DB] Failed to open:", err);
    if (err?.name === "VersionError") {
      throw new Error(
        "Database version conflict. Reset from Sync Monitoring page."
      );
    }
    throw error;
  }
}

export async function resetDatabase(): Promise<void> {
  await db.delete();
  await db.open();
}

export function generateLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
