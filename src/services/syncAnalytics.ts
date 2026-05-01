// Records sync attempts to localStorage for the Sync Monitoring dashboard.
// Rolling window of last MAX_ATTEMPTS attempts within 24h.

import type { SyncEntityType } from "@/lib/db";

export interface SyncAttempt {
  id: string;
  timestamp: number;
  type: SyncEntityType | "batch";
  entityId?: string;
  status: "success" | "failed" | "pending";
  durationMs?: number;
  retryCount?: number;
  error?: string;
}

const STORAGE_KEY = "crm.syncAnalytics.attempts";
const MAX_ATTEMPTS = 100;
const WINDOW_MS = 24 * 60 * 60 * 1000;

type Listener = (attempts: SyncAttempt[]) => void;

class SyncAnalytics {
  private attempts: SyncAttempt[] = [];
  private listeners = new Set<Listener>();

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SyncAttempt[];
      const cutoff = Date.now() - WINDOW_MS;
      this.attempts = parsed.filter((a) => a.timestamp >= cutoff);
    } catch {
      this.attempts = [];
    }
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.attempts));
    } catch {
      // Quota exceeded; trim and try once.
      this.attempts = this.attempts.slice(-50);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.attempts));
      } catch {
        /* give up */
      }
    }
  }

  record(attempt: Omit<SyncAttempt, "id" | "timestamp"> & { timestamp?: number }) {
    const entry: SyncAttempt = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: attempt.timestamp ?? Date.now(),
      ...attempt,
    };
    this.attempts.push(entry);
    if (this.attempts.length > MAX_ATTEMPTS) {
      this.attempts = this.attempts.slice(-MAX_ATTEMPTS);
    }
    this.persist();
    this.notify();
  }

  getAttempts(): SyncAttempt[] {
    const cutoff = Date.now() - WINDOW_MS;
    return this.attempts.filter((a) => a.timestamp >= cutoff).slice().reverse();
  }

  getStats() {
    const recent = this.getAttempts();
    const success = recent.filter((a) => a.status === "success").length;
    const failed = recent.filter((a) => a.status === "failed").length;
    const pending = recent.filter((a) => a.status === "pending").length;
    const total = recent.length;
    const durations = recent
      .map((a) => a.durationMs)
      .filter((d): d is number => typeof d === "number");
    const avgDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;
    return {
      total,
      success,
      failed,
      pending,
      successRate: total > 0 ? success / total : 1,
      avgDurationMs: avgDuration,
    };
  }

  clear() {
    this.attempts = [];
    this.persist();
    this.notify();
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    const snapshot = this.getAttempts();
    this.listeners.forEach((cb) => cb(snapshot));
  }
}

export const syncAnalytics = new SyncAnalytics();
