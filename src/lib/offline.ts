// Small offline-related helpers used across pages.

import { db } from "@/lib/db";

export const isOnline = (): boolean =>
  typeof navigator !== "undefined" ? navigator.onLine : true;

/**
 * Guard a feature that requires network. Returns true when online; otherwise
 * shows a toast (if `notify` provided) and returns false. Use at the top of
 * bulk-send / outbound communication handlers — these aren't safe to queue
 * because they would result in messages being sent at the wrong time.
 */
export function requireOnline(
  feature: string,
  notify?: { error: (title: string, msg?: any) => void }
): boolean {
  if (isOnline()) return true;
  notify?.error(
    "Internet required",
    `${feature} can't run offline. Reconnect and try again.`
  );
  return false;
}

/**
 * Trim Dexie tables of stale 'synced' rows older than `maxAgeDays`. Pending /
 * failed rows are never trimmed — those still need to sync.
 *
 * Call opportunistically (e.g. after a successful sync). Doesn't run when the
 * device is offline; storage pressure is best handled when we're online.
 */
export async function ttlOfflineTables(maxAgeDays = 30): Promise<{
  tasks: number;
  contacts: number;
  activities: number;
  callLogs: number;
  tickets: number;
  ticketComments: number;
}> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const cutoffMs = cutoff.getTime();
  const counts = {
    tasks: 0,
    contacts: 0,
    activities: 0,
    callLogs: 0,
    tickets: 0,
    ticketComments: 0,
  };

  const eligible = (row: { syncStatus?: string; updatedAt?: Date; createdAt?: Date }): boolean => {
    if (row.syncStatus !== "synced") return false;
    const ts = row.updatedAt ?? row.createdAt;
    return !!ts && ts.getTime() < cutoffMs;
  };

  counts.tasks = await db.tasks.filter(eligible).delete();
  counts.contacts = await db.contacts.filter(eligible).delete();
  counts.activities = await db.activities.filter(eligible).delete();
  counts.callLogs = await db.callLogs.filter(eligible).delete();
  counts.tickets = await db.tickets.filter(eligible).delete();
  counts.ticketComments = await db.ticketComments.filter(eligible).delete();

  return counts;
}
