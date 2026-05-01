// Service Worker registration + bidirectional messaging
// Mirrors field-sync's swManager.

export interface SWStatus {
  registered: boolean;
  supported: boolean;
  lastSync?: Date;
  pendingCount?: number;
}

type SyncResult = { success: boolean; cancelled?: boolean; error?: string };

class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private syncListeners: Set<(status: SWStatus) => void> = new Set();
  private currentAbort: AbortController | null = null;

  async register(): Promise<void> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      console.warn("[SW] Service Workers not supported");
      return;
    }
    try {
      this.registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      console.log("[SW] Registered:", this.registration.scope);

      this.registration.addEventListener("updatefound", () => {
        const newWorker = this.registration?.installing;
        newWorker?.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            window.dispatchEvent(new CustomEvent("sw-update-available"));
          }
        });
      });

      navigator.serviceWorker.addEventListener("message", (e) =>
        this.handleMessage(e)
      );

      // Background Sync registration is best-effort.
      if ("sync" in this.registration) {
        console.log("[SW] Background Sync supported");
      }
      const periodicSync = (
        this.registration as ServiceWorkerRegistration & {
          periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
        }
      ).periodicSync;
      if (periodicSync) {
        try {
          await periodicSync.register("crm-sync", {
            minInterval: 30 * 60 * 1000,
          });
          console.log("[SW] Periodic sync registered");
        } catch {
          /* not allowed without permission */
        }
      }
    } catch (err) {
      console.error("[SW] Registration failed:", err);
      throw err;
    }
  }

  async unregister(): Promise<void> {
    if (this.registration) {
      await this.registration.unregister();
      this.registration = null;
    }
  }

  cancelSync(): void {
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }
  }

  async requestSync(): Promise<void> {
    this.cancelSync();
    if (!this.registration) {
      // SW not registered yet (e.g. dev). Fall back to in-page processing.
      const { processSyncQueue } = await import("@/services/syncProcessor");
      await processSyncQueue();
      return;
    }
    this.currentAbort = new AbortController();

    const reg = this.registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (reg.sync) {
      try {
        await reg.sync.register("crm-sync");
        return;
      } catch (err) {
        console.warn("[SW] Background sync failed, falling back:", err);
      }
    }
    await this.triggerManualSync();
  }

  async triggerManualSync(): Promise<void> {
    if (!this.registration?.active) {
      const { processSyncQueue } = await import("@/services/syncProcessor");
      await processSyncQueue();
      return;
    }
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event: MessageEvent<SyncResult>) => {
        if (event.data.success) resolve();
        else reject(new Error(event.data.error ?? "Sync failed"));
      };
      this.registration!.active!.postMessage({ type: "SYNC_NOW" }, [
        channel.port2,
      ]);
      setTimeout(() => reject(new Error("Sync timeout")), 30000);
    });
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    const data = event.data as { type?: string; items?: unknown[]; count?: number; error?: string };
    if (!data?.type) return;

    switch (data.type) {
      case "PROCESS_SYNC_QUEUE": {
        try {
          const { processSyncQueue } = await import("@/services/syncProcessor");
          await processSyncQueue();
          event.ports[0]?.postMessage({ success: true });
        } catch (err) {
          event.ports[0]?.postMessage({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
        break;
      }
      case "SYNC_COMPLETE":
        this.syncListeners.forEach((cb) =>
          cb({
            registered: true,
            supported: true,
            lastSync: new Date(),
            pendingCount: 0,
          })
        );
        break;
      case "SYNC_FAILED":
        console.error("[SW] Sync failed:", data.error);
        break;
    }
  }

  onSyncStatusChange(cb: (status: SWStatus) => void): () => void {
    this.syncListeners.add(cb);
    return () => {
      this.syncListeners.delete(cb);
    };
  }

  async getStatus(): Promise<SWStatus> {
    return {
      registered: !!this.registration,
      supported:
        typeof navigator !== "undefined" && "serviceWorker" in navigator,
    };
  }

  async checkForUpdates(): Promise<void> {
    if (this.registration) await this.registration.update();
  }

  async skipWaiting(): Promise<void> {
    this.registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  }
}

export const swManager = new ServiceWorkerManager();
