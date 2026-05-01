import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary";
import { setupErrorLogging } from "./lib/errorLogger";
import { initializeDatabase } from "./lib/db";
import { swManager } from "./lib/serviceWorker";
import { setupAutoSync, processSyncQueue } from "./services/syncProcessor";

// Set up global error logging
setupErrorLogging();

// Initialize offline database (idempotent)
initializeDatabase().catch((err) => console.error("[Boot] DB init failed:", err));

// Register service worker (production only — dev would race the Vite SW)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    swManager.register().catch((err) =>
      console.error("[Boot] SW register failed:", err)
    );
  });
}

// Online/offline plumbing
setupAutoSync();
window.addEventListener("online", () => {
  // Best-effort kick. setupAutoSync also listens, but request the SW path too
  // so background sync can take over when the tab is backgrounded.
  swManager.requestSync().catch(() => void processSyncQueue());
});

// Configure React Query with optimal caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
      gcTime: 10 * 60 * 1000, // 10 minutes - cache time (formerly cacheTime)
      refetchOnWindowFocus: false, // Prevent unnecessary refetches
      retry: 1, // Only retry once on failure
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </QueryClientProvider>
);
