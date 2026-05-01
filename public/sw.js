// In-Sync CRM Service Worker
// - Precaches build assets via Workbox manifest
// - Background Sync + Periodic Sync triggers main app to drain syncQueue
// - Network-first passthrough for Supabase API calls
// Mirrors field-sync's sw.js, adapted for CRM.

const CACHE_NAME = "crm-sync-v1";
const SYNC_TAG = "crm-sync";

// Workbox manifest injection point.
const precacheManifest = self.__WB_MANIFEST || [];
console.log("[SW] Precache manifest:", precacheManifest.length, "assets");

self.addEventListener("install", () => {
  console.log("[SW] Installing");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activating");
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  return self.clients.claim();
});

// Background Sync — fires when network returns after queued sync.
self.addEventListener("sync", (event) => {
  console.log("[SW] sync event:", event.tag);
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingData());
  }
});

// Periodic Background Sync — Chrome/Edge only.
self.addEventListener("periodicsync", (event) => {
  console.log("[SW] periodicsync event:", event.tag);
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingData());
  }
});

// Manual trigger from the page.
self.addEventListener("message", (event) => {
  if (!event.data) return;

  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data.type === "CANCEL_SYNC") {
    return;
  }

  if (event.data.type === "SYNC_NOW") {
    syncPendingData()
      .then(() => event.ports[0]?.postMessage({ success: true }))
      .catch((err) => {
        if (err && (err.name === "AbortError" || /cancel/i.test(err.message))) {
          event.ports[0]?.postMessage({ success: true, cancelled: true });
        } else {
          event.ports[0]?.postMessage({
            success: false,
            error: err?.message || String(err),
          });
        }
      });
  }
});

async function syncPendingData() {
  console.log("[SW] Starting sync");
  try {
    const db = await openDatabase();
    const pending = await getPendingItems(db);
    if (pending.length === 0) {
      console.log("[SW] Queue empty");
      return;
    }
    console.log("[SW] Pending items:", pending.length);

    const clients = await self.clients.matchAll();
    if (clients.length === 0) {
      console.warn("[SW] No active clients; will retry");
      throw new Error("No active clients");
    }

    const channel = new MessageChannel();
    const syncPromise = new Promise((resolve, reject) => {
      channel.port1.onmessage = (e) => {
        if (e.data.success) resolve(e.data);
        else reject(new Error(e.data.error || "Sync failed"));
      };
      setTimeout(() => reject(new Error("Sync timeout")), 30000);
    });

    clients[0].postMessage(
      { type: "PROCESS_SYNC_QUEUE", items: pending },
      [channel.port2]
    );

    await syncPromise;
    console.log("[SW] Sync complete");

    clients.forEach((client) =>
      client.postMessage({ type: "SYNC_COMPLETE", count: pending.length })
    );
  } catch (err) {
    console.error("[SW] Sync failed:", err);
    const clients = await self.clients.matchAll();
    clients.forEach((client) =>
      client.postMessage({ type: "SYNC_FAILED", error: err?.message })
    );
    throw err;
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    // Open without specifying version — Dexie owns the schema in the page.
    const request = indexedDB.open("InSyncCRMDB");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getPendingItems(db) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(["syncQueue"], "readonly");
      const store = tx.objectStore("syncQueue");
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        resolve(
          all.filter((item) => (item.retryCount ?? 0) < (item.maxRetries ?? 5))
        );
      };
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

// Network-first passthrough for Supabase API calls so an offline failure
// surfaces a graceful 503 instead of a network error.
self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  if (!/\.supabase\.co\//i.test(url)) return;

  event.respondWith(
    fetch(event.request).catch(() =>
      new Response(
        JSON.stringify({
          error: "Offline — changes will sync when connection returns",
          offline: true,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )
    )
  );
});

console.log("[SW] Loaded");
