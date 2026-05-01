// Central sync queue processor.
// Per-entity processors live in their respective offline hooks/modules and are
// imported here. Field-sync style: each entity owns its own sync logic.

import { db } from "@/lib/db";
import { logger } from "./logger";
import { networkMonitor } from "./networkMonitor";
import { syncAnalytics } from "./syncAnalytics";
import { supabase } from "@/integrations/supabase/client";

const MAX_RETRIES_DEFAULT = 5;

// Per-entity sync functions are registered by their owning modules so we don't
// have to keep editing this file every time we add an entity. Each function
// processes its own subset of the syncQueue.
type EntitySyncFn = () => Promise<void>;
const entitySyncFns: Record<string, EntitySyncFn> = {};

export function registerEntitySync(type: string, fn: EntitySyncFn): void {
  entitySyncFns[type] = fn;
}

// Process the full queue. Called on online event, periodic interval, manual
// button, and SW background sync.
export async function processSyncQueue(): Promise<void> {
  if (!networkMonitor.shouldSync()) {
    logger.info("Skipping sync — offline", "SyncProcessor");
    return;
  }

  // Refresh session before sync. Long-offline windows expire the JWT.
  try {
    await supabase.auth.getSession();
  } catch (err) {
    logger.warn("Session refresh failed", "SyncProcessor", err);
  }

  const start = Date.now();
  logger.info("Sync started", "SyncProcessor");

  for (const [type, fn] of Object.entries(entitySyncFns)) {
    try {
      await fn();
    } catch (err) {
      logger.error(`Sync failed for ${type}`, "SyncProcessor", err);
      syncAnalytics.record({
        type: "batch",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  syncAnalytics.record({
    type: "batch",
    status: "success",
    durationMs: Date.now() - start,
  });
  logger.info(`Sync finished in ${Date.now() - start}ms`, "SyncProcessor");
}

export async function getSyncQueueStatus() {
  const items = await db.syncQueue.toArray();
  return {
    total: items.length,
    pending: items.filter((i) => i.retryCount < (i.maxRetries ?? MAX_RETRIES_DEFAULT))
      .length,
    failed: items.filter((i) => i.retryCount >= (i.maxRetries ?? MAX_RETRIES_DEFAULT))
      .length,
    byType: items.reduce<Record<string, number>>((acc, i) => {
      acc[i.type] = (acc[i.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

let autoSyncInstalled = false;

export function setupAutoSync(): void {
  if (autoSyncInstalled || typeof window === "undefined") return;
  autoSyncInstalled = true;

  window.addEventListener("online", () => {
    logger.info("Browser online — triggering sync", "SyncProcessor");
    void processSyncQueue();
  });

  // Periodic sweep while online.
  setInterval(() => {
    if (navigator.onLine) void processSyncQueue();
  }, 60_000);
}
