import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import type Dexie from "dexie";

export interface RealtimeSyncOptions {
  table: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  filter?: string;
  enabled?: boolean;
  /**
   * Optional Dexie table name to guard against. When set, UPDATE/DELETE
   * events for rows whose local syncStatus is 'pending' are dropped — this
   * prevents the realtime feed from overwriting un-synced offline edits.
   */
  dexieTable?:
    | "tasks"
    | "contacts"
    | "activities"
    | "callLogs"
    | "tickets"
    | "ticketComments";
}

/**
 * Hook for real-time database synchronization
 * Automatically subscribes to table changes and handles cleanup
 * 
 * PERFORMANCE: Uses refs to stabilize callbacks and prevent subscription churn
 */
export function useRealtimeSync({
  table,
  onInsert,
  onUpdate,
  onDelete,
  filter,
  enabled = true,
  dexieTable,
}: RealtimeSyncOptions) {
  // Use refs to store callbacks to prevent subscription churn
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);
  const dexieTableRef = useRef(dexieTable);

  // Update refs when callbacks change (but don't trigger re-subscription)
  useEffect(() => {
    onInsertRef.current = onInsert;
  }, [onInsert]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  useEffect(() => {
    dexieTableRef.current = dexieTable;
  }, [dexieTable]);

  // Stable handler that uses refs
  const handleChange = useCallback(async (payload: any) => {
    console.log(`[Realtime] ${table} change:`, payload.eventType);

    // Guard: if the local Dexie row has un-synced changes, drop the realtime
    // patch so we don't clobber the user's offline edit before it syncs.
    if (
      dexieTableRef.current &&
      (payload.eventType === "UPDATE" || payload.eventType === "DELETE")
    ) {
      const id = payload.new?.id ?? payload.old?.id;
      if (id) {
        try {
          const tableRef = (db as unknown as Record<string, Dexie.Table | undefined>)[
            dexieTableRef.current
          ];
          if (tableRef) {
            const local = await tableRef.get(id);
            if (local && (local as { syncStatus?: string }).syncStatus === "pending") {
              console.log(
                `[Realtime] Dropping ${payload.eventType} for ${dexieTableRef.current}:${id} — local has pending edits`
              );
              return;
            }
          }
        } catch (err) {
          console.warn("[Realtime] Dexie guard failed", err);
        }
      }
    }

    switch (payload.eventType) {
      case "INSERT":
        onInsertRef.current?.(payload);
        break;
      case "UPDATE":
        onUpdateRef.current?.(payload);
        break;
      case "DELETE":
        onDeleteRef.current?.(payload);
        break;
    }
  }, [table]);

  useEffect(() => {
    if (!enabled) return;

    const channelName = filter 
      ? `${table}-changes-${filter}` 
      : `${table}-changes`;

    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: table,
          filter: filter,
        },
        handleChange
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[Realtime] Subscribed to ${table} changes`);
        }
      });

    return () => {
      console.log(`[Realtime] Unsubscribing from ${table} changes`);
      supabase.removeChannel(channel);
    };
  }, [table, filter, enabled, handleChange]);
}
